import { z } from "zod"

import { zInternalAction } from ".."
import { internal } from "../_generated/api"

// ─── Resolution Notifications ───────────────────────────────────────────────

export const sendResolutionNotifications = zInternalAction({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const { incidentId } = args

		const incident = await ctx.runQuery(internal.incidents.getInternal, {
			incidentId,
		})
		if (!incident) return

		const slackWebhook = process.env.SLACK_WEBHOOK_URL
		const resendFrom = process.env.RESEND_FROM_EMAIL

		// Slack resolution notification
		if (slackWebhook) {
			try {
				const payload = {
					text: `RESOLVED: ${incident.title}`,
					blocks: [
						{
							type: "header",
							text: {
								type: "plain_text",
								text: "Incident Resolved",
							},
						},
						{
							type: "section",
							text: {
								type: "mrkdwn",
								text: `*${incident.title}*\nIncident has been resolved by the automated debugging pipeline.`,
							},
						},
						...(incident.qaScore
							? [
									{
										type: "section",
										fields: [
											{
												type: "mrkdwn",
												text: `*QA Score:* ${incident.qaScore}/100`,
											},
											{
												type: "mrkdwn",
												text: `*Debug Attempts:* ${incident.debugAttempts}`,
											},
										],
									},
								]
							: []),
						...(incident.linearTicketUrl
							? [
									{
										type: "section",
										text: {
											type: "mrkdwn",
											text: `<${incident.linearTicketUrl}|View Linear Ticket #${incident.linearTicketNumber}>`,
										},
									},
								]
							: []),
					],
				}

				await fetch(slackWebhook, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				})

				await ctx.runMutation(internal.incidents.addNotification, {
					incidentId,
					channel: "slack",
					recipient: "#sre-incidents",
					status: "sent",
					messageBody: `Resolved: ${incident.title}`,
				})
			} catch (e) {
				console.error("Slack resolution notification failed:", e)
			}
		}

		// Email resolution notification to reporter
		if (resendFrom && incident.reporterEmail) {
			const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #16a34a;">Incident Resolved</h2>
  <p><strong>Title:</strong> ${incident.title}</p>
  <p>Your incident has been resolved by our automated SRE pipeline.</p>
  ${incident.fixDescription ? `<p><strong>Fix:</strong> ${incident.fixDescription}</p>` : ""}
  ${incident.qaScore ? `<p><strong>QA Score:</strong> ${incident.qaScore}/100</p>` : ""}
  ${incident.linearTicketUrl ? `<p><a href="${incident.linearTicketUrl}" style="color: #2563eb;">View Linear Ticket #${incident.linearTicketNumber}</a></p>` : ""}
  <hr />
  <p style="color: #6b7280; font-size: 12px;">Sent by Trusty SRE Agent Platform</p>
</body>
</html>`

			await ctx.runMutation(internal.agents.email.sendEmailInternal, {
				to: incident.reporterEmail,
				subject: `[Trusty] Resolved: ${incident.title}`,
				html,
				from: resendFrom,
			})

			await ctx.runMutation(internal.incidents.addNotification, {
				incidentId,
				channel: "email",
				recipient: incident.reporterEmail,
				status: "sent",
				messageBody: `Resolution notification sent to ${incident.reporterEmail}`,
			})
		}

		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId,
			status: "resolved",
			event: "Resolution notifications sent — incident closed",
			agentName: "Notifier",
		})
	},
})
