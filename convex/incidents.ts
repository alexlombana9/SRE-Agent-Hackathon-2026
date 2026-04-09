import { ConvexError } from "convex/values"
import { z } from "zod"

import { zInternalMutation, zInternalQuery, zMutation, zQuery } from "."
import { requireUser } from "./auth"
import { config } from "./config"
import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"

const severityEnum = z.enum(["critical", "high", "medium", "low"])
const categoryEnum = z.enum([
	"payment",
	"checkout",
	"inventory",
	"auth",
	"performance",
	"infra",
	"other",
])
const statusEnum = z.enum([
	"submitted",
	"analyzing",
	"ticketed",
	"notified",
	"debugging",
	"reviewing",
	"resolved",
	"failed",
])

export const create = zMutation({
	args: z.object({
		title: z.string(),
		description: z.string(),
		severity: severityEnum,
		category: categoryEnum,
		reporterName: z.string(),
		reporterEmail: z.string(),
		reporterPhone: z.string().optional(),
		rawLogs: z.string().optional(),
		attachmentIds: z.array(z.string()).default([]),
	}),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx)

		const incidentId = await ctx.db.insert("incidents", {
			title: args.title,
			description: args.description,
			severity: args.severity,
			category: args.category,
			reporterName: args.reporterName,
			reporterEmail: args.reporterEmail,
			reporterPhone: args.reporterPhone,
			rawLogs: args.rawLogs,
			attachmentIds: args.attachmentIds,
			status: "submitted",
			awaitingApproval: false,
			userId: user._id,
		})

		await ctx.scheduler.runAfter(0, internal.agents.runPipeline, {
			incidentId: incidentId as unknown as string,
		})

		return incidentId
	},
})

export const get = zQuery({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		return ctx.db.get(id)
	},
})

export const list = zQuery({
	handler: async (ctx) => {
		const user = await requireUser(ctx)
		return ctx.db
			.query("incidents")
			.withIndex("by_userId", (q) => q.eq("userId", user._id))
			.order("desc")
			.take(100)
	},
})

export const listAll = zQuery({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity()
		if (!identity) throw new ConvexError(config.errors.unauthorized)
		return ctx.db.query("incidents").order("desc").take(200)
	},
})

export const getEvents = zQuery({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		return ctx.db
			.query("incidentEvents")
			.withIndex("by_incidentId", (q) => q.eq("incidentId", id))
			.order("asc")
			.collect()
	},
})

export const getNotifications = zQuery({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		return ctx.db
			.query("notifications")
			.withIndex("by_incidentId", (q) => q.eq("incidentId", id))
			.collect()
	},
})

export const updateStatus = zInternalMutation({
	args: z.object({
		incidentId: z.string(),
		status: statusEnum,
		event: z.string(),
		agentName: z.string().optional(),
		detail: z.string().optional(),
	}),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		await ctx.db.patch(id, { status: args.status })
		await ctx.db.insert("incidentEvents", {
			incidentId: id,
			event: args.event,
			agentName: args.agentName,
			detail: args.detail,
		})
	},
})

export const updateAnalysis = zInternalMutation({
	args: z.object({
		incidentId: z.string(),
		analysis: z.object({
			summary: z.string(),
			keyFindings: z.array(z.string()),
			errorPatterns: z.array(z.string()),
			affectedSystems: z.array(z.string()),
			userImpact: z.string(),
			confidence: z.number(),
		}),
		classification: z.object({
			team: z.string(),
			confidence: z.number(),
			reasoning: z.string(),
		}),
		analyzerThreadId: z.string().optional(),
	}),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		await ctx.db.patch(id, {
			analysis: args.analysis,
			classification: args.classification,
			analyzerThreadId: args.analyzerThreadId,
		})
	},
})

export const updateTicket = zInternalMutation({
	args: z.object({
		incidentId: z.string(),
		linearTicketId: z.string(),
		linearTicketUrl: z.string(),
		linearTicketNumber: z.number(),
	}),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		await ctx.db.patch(id, {
			linearTicketId: args.linearTicketId,
			linearTicketUrl: args.linearTicketUrl,
			linearTicketNumber: args.linearTicketNumber,
		})
	},
})

export const setAwaitingApproval = zInternalMutation({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		await ctx.db.patch(id, { awaitingApproval: true })
		await ctx.db.insert("incidentEvents", {
			incidentId: id,
			event: "Awaiting human approval — critical incident",
			agentName: "Orchestrator",
		})
	},
})

export const addNotification = zInternalMutation({
	args: z.object({
		incidentId: z.string(),
		channel: z.enum(["slack", "email", "sms"]),
		recipient: z.string(),
		status: z.enum(["pending", "sent", "failed"]),
		messageBody: z.string(),
		sentAt: z.number().optional(),
	}),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		await ctx.db.insert("notifications", {
			incidentId: id,
			channel: args.channel,
			recipient: args.recipient,
			status: args.status,
			messageBody: args.messageBody,
			sentAt: args.sentAt ?? Date.now(),
		})
	},
})

export const updateApproval = zMutation({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const user = await requireUser(ctx)
		const id = args.incidentId as Id<"incidents">
		const incident = await ctx.db.get(id)

		if (!incident) throw new ConvexError(config.errors.notFound)
		if (!incident.awaitingApproval) {
			throw new ConvexError("Incident is not awaiting approval")
		}

		await ctx.db.patch(id, { awaitingApproval: false })
		await ctx.db.insert("incidentEvents", {
			incidentId: id,
			event: `Approved by ${user.name}`,
			agentName: "Human",
			detail: "Critical incident approved — resuming pipeline",
		})

		await ctx.scheduler.runAfter(0, internal.agents.createTicket, {
			incidentId: args.incidentId,
		})
	},
})

export const getInternal = zInternalQuery({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const id = args.incidentId as Id<"incidents">
		return ctx.db.get(id)
	},
})

export const updateStatusPublic = zMutation({
	args: z.object({
		incidentId: z.string(),
		newStatus: z.enum(["submitted", "analyzing", "notified", "resolved"]),
	}),
	handler: async (ctx, args) => {
		await requireUser(ctx)
		const id = args.incidentId as Id<"incidents">
		const incident = await ctx.db.get(id)

		if (!incident) throw new ConvexError(config.errors.notFound)

		// Prevent moving out of awaiting approval via drag-drop
		if (incident.awaitingApproval) {
			throw new ConvexError("Use the approval button to approve critical incidents")
		}

		await ctx.db.patch(id, { status: args.newStatus })
		await ctx.db.insert("incidentEvents", {
			incidentId: id,
			event: `Status changed to ${args.newStatus}`,
			agentName: "Human",
		})

		// If resolving manually, schedule resolution notifications
		if (args.newStatus === "resolved") {
			await ctx.scheduler.runAfter(0, internal.agents.sendResolutionNotification, {
				incidentId: args.incidentId,
			})
		}
	},
})
