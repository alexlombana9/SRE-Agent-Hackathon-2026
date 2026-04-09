import { defineSchema } from "convex/server"
import { z } from "zod"

import { zodTable } from "."

export const users = zodTable("users", () => ({
	tokenIdentifier: z.string(),
	email: z.string().email(),
	name: z.string(),
	role: z.enum(["user", "admin"]).optional(),
	onboardingCompleted: z.boolean().default(false),
}))

export const todos = zodTable("todos", () => ({
	text: z.string().min(1),
	completed: z.boolean().default(false),
	userId: z.string().optional(),
}))

export const incidents = zodTable("incidents", (zid) => ({
	title: z.string(),
	description: z.string(),
	reporterName: z.string(),
	reporterEmail: z.string(),
	reporterPhone: z.string().optional(),
	severity: z.enum(["critical", "high", "medium", "low"]),
	category: z.enum([
		"payment",
		"checkout",
		"inventory",
		"auth",
		"performance",
		"infra",
		"other",
	]),
	status: z.enum([
		"submitted",
		"analyzing",
		"ticketed",
		"notified",
		"debugging",
		"reviewing",
		"resolved",
		"failed",
	]),
	rawLogs: z.string().optional(),
	attachmentIds: z.array(z.string()),
	analysis: z
		.object({
			summary: z.string(),
			keyFindings: z.array(z.string()),
			errorPatterns: z.array(z.string()),
			affectedSystems: z.array(z.string()),
			userImpact: z.string(),
			confidence: z.number(),
		})
		.optional(),
	classification: z
		.object({
			team: z.string(),
			confidence: z.number(),
			reasoning: z.string(),
		})
		.optional(),
	linearTicketId: z.string().optional(),
	linearTicketUrl: z.string().optional(),
	linearTicketNumber: z.number().optional(),
	awaitingApproval: z.boolean().default(false),
	analyzerThreadId: z.string().optional(),
	triageThreadId: z.string().optional(),
	fixDescription: z.string().optional(),
	fixDiff: z.string().optional(),
	qaScore: z.number().optional(),
	qaFeedback: z.string().optional(),
	qaApproved: z.boolean().optional(),
	debugAttempts: z.number().default(0),
	debuggerThreadId: z.string().optional(),
	reviewerThreadId: z.string().optional(),
	sandboxId: z.string().optional(),
	userId: zid("users"),
}))

export const incidentEvents = zodTable("incidentEvents", (zid) => ({
	incidentId: zid("incidents"),
	event: z.string(),
	agentName: z.string().optional(),
	detail: z.string().optional(),
}))

export const notifications = zodTable("notifications", (zid) => ({
	incidentId: zid("incidents"),
	channel: z.enum(["slack", "email", "sms"]),
	recipient: z.string(),
	status: z.enum(["pending", "sent", "failed"]),
	sentAt: z.number().optional(),
	messageBody: z.string(),
}))

export default defineSchema({
	users: users.table().index("by_tokenIdentifier", ["tokenIdentifier"]),
	todos: todos.table(),
	incidents: incidents
		.table()
		.index("by_userId", ["userId"])
		.index("by_status", ["status"]),
	incidentEvents: incidentEvents
		.table()
		.index("by_incidentId", ["incidentId"]),
	notifications: notifications.table().index("by_incidentId", ["incidentId"]),
})
