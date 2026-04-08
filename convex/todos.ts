import { z } from "zod"

import { zMutation, zQuery } from "."

export const list = zQuery({
	handler: async (ctx) => {
		return ctx.db.query("todos").order("desc").collect()
	},
})

export const add = zMutation({
	args: z.object({ text: z.string().min(1) }),
	handler: async (ctx, args) => {
		return ctx.db.insert("todos", { text: args.text, completed: false })
	},
})

export const toggle = zMutation({
	args: z.object({ id: z.string().describe("Convex Id<todos>") }),
	handler: async (ctx, args) => {
		const { id } = args as { id: import("./_generated/dataModel").Id<"todos"> }
		const todo = await ctx.db.get(id)
		if (!todo) throw new Error("Todo not found")
		return ctx.db.patch(id, { completed: !todo.completed })
	},
})

export const remove = zMutation({
	args: z.object({ id: z.string().describe("Convex Id<todos>") }),
	handler: async (ctx, args) => {
		const { id } = args as { id: import("./_generated/dataModel").Id<"todos"> }
		return ctx.db.delete(id)
	},
})
