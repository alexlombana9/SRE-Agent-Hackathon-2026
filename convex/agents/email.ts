import { Resend } from "@convex-dev/resend"
import { Twilio } from "@convex-dev/twilio"
import { z } from "zod"

import { zInternalAction, zInternalMutation } from ".."
import { components } from "../_generated/api"

const resend = new Resend(components.resend)
const twilio = new Twilio(components.twilio, {
	TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
	TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
})

export const sendEmailInternal = zInternalMutation({
	args: z.object({
		to: z.string(),
		subject: z.string(),
		html: z.string(),
		from: z.string(),
	}),
	handler: async (ctx, args) => {
		try {
			await resend.sendEmail(ctx, {
				from: args.from,
				to: [args.to],
				subject: args.subject,
				html: args.html,
			})
		} catch (e) {
			console.error("Resend email failed:", e)
		}
	},
})

// Twilio requires ActionCtx (it calls runAction internally)
export const sendSmsInternal = zInternalAction({
	args: z.object({
		to: z.string(),
		body: z.string(),
		from: z.string(),
	}),
	handler: async (ctx, args) => {
		try {
			await twilio.sendMessage(ctx, {
				to: args.to,
				from: args.from,
				body: args.body,
			})
		} catch (e) {
			console.error("Twilio SMS failed:", e)
		}
	},
})
