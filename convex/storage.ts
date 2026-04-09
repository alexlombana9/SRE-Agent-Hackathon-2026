import { zMutation } from "."

export const generateUploadUrl = zMutation({
	handler: async (ctx) => {
		return ctx.storage.generateUploadUrl()
	},
})
