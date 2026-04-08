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

export default defineSchema({
	users: users.table().index("by_tokenIdentifier", ["tokenIdentifier"]),
	todos: todos.table(),
})
