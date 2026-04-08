import { ConvexError } from "convex/values"
import { z } from "zod"

import { zMutation, zQuery } from "."
import { getCurrentUser, requireRole } from "./auth"
import { config } from "./config"
import type { Id } from "./_generated/dataModel"

export const me = zQuery({
	handler: async (ctx) => {
		return getCurrentUser(ctx)
	},
})

export const bootstrap = zMutation({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity()
		if (!identity) throw new ConvexError(config.errors.unauthorized)

		const existing = await ctx.db
			.query("users")
			.withIndex("by_tokenIdentifier", (q) =>
				q.eq("tokenIdentifier", identity.tokenIdentifier),
			)
			.first()

		if (existing) return existing._id

		return ctx.db.insert("users", {
			tokenIdentifier: identity.tokenIdentifier,
			email: identity.email ?? "",
			name: identity.name ?? identity.email ?? "",
			onboardingCompleted: false,
		})
	},
})

export const assignRole = zMutation({
	args: z.object({
		userId: z.string().describe("Convex Id<users>"),
		role: z.enum(["user", "admin"]),
	}),
	handler: async (ctx, args) => {
		await requireRole(ctx, ["admin"])

		const userId = args.userId as Id<"users">
		const user = await ctx.db.get(userId)
		if (!user) throw new ConvexError(config.errors.notFound)

		return ctx.db.patch(userId, { role: args.role })
	},
})

export const deleteAccount = zMutation({
	handler: async (ctx) => {
		const user = await getCurrentUser(ctx)
		if (!user) throw new ConvexError(config.errors.unauthorized)

		return ctx.db.delete(user._id)
	},
})

export const list = zQuery({
	handler: async (ctx) => {
		await requireRole(ctx, ["admin"])
		return ctx.db.query("users").collect()
	},
})
