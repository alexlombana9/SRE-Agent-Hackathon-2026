import { createTool } from "@convex-dev/agent"
import { z } from "zod"

import { internal } from "../_generated/api"

// ─── Linear Tools ───────────────────────────────────────────────────────────

const LINEAR_CREATE_ISSUE_GQL = `
  mutation CreateIssue($title: String!, $description: String!, $teamId: String!, $priority: Int!) {
    issueCreate(input: {
      title: $title
      description: $description
      teamId: $teamId
      priority: $priority
    }) {
      success
      issue { id number url title }
    }
  }
`

const LINEAR_CREATE_COMMENT_GQL = `
  mutation CommentCreate($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment { id body }
    }
  }
`

export const createLinearTicket = createTool({
	description:
		"Create a ticket in Linear for this incident. Use the analysis data to write a clear, actionable ticket title and description. Map severity to priority: critical=1, high=2, medium=3, low=4.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID to link the ticket to"),
		title: z
			.string()
			.describe(
				"Ticket title, e.g. '[CRITICAL] Payment gateway returning 503 errors'",
			),
		description: z
			.string()
			.describe(
				"Full ticket body in markdown with: summary, key findings, affected systems, error patterns, reporter info, classification",
			),
		priority: z
			.number()
			.min(1)
			.max(4)
			.describe("Linear priority: 1=urgent, 2=high, 3=medium, 4=low"),
	}),
	execute: async (ctx, input) => {
		const linearApiKey = process.env.LINEAR_API_KEY
		const linearTeamId = process.env.LINEAR_TEAM_ID

		if (!linearApiKey || !linearTeamId) {
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId: input.incidentId,
				status: "ticketed",
				event: "Linear not configured — skipping ticket creation",
				agentName: "Triage",
			})
			return {
				success: false,
				reason: "LINEAR_API_KEY or LINEAR_TEAM_ID not configured",
			}
		}

		try {
			const response = await fetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${linearApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: LINEAR_CREATE_ISSUE_GQL,
					variables: {
						title: input.title.slice(0, 80),
						description: input.description,
						teamId: linearTeamId,
						priority: input.priority,
					},
				}),
			})

			const data = (await response.json()) as {
				data?: {
					issueCreate?: {
						success: boolean
						issue?: { id: string; number: number; url: string }
					}
				}
				errors?: Array<{ message: string }>
			}

			const issue = data?.data?.issueCreate?.issue
			if (issue) {
				await ctx.runMutation(internal.incidents.updateTicket, {
					incidentId: input.incidentId,
					linearTicketId: issue.id,
					linearTicketUrl: issue.url,
					linearTicketNumber: issue.number,
				})

				await ctx.runMutation(internal.incidents.updateStatus, {
					incidentId: input.incidentId,
					status: "ticketed",
					event: `Linear ticket created: #${issue.number}`,
					agentName: "Triage",
					detail: issue.url,
				})

				return {
					success: true,
					ticketId: issue.id,
					ticketNumber: issue.number,
					ticketUrl: issue.url,
				}
			}

			const errMsg = data?.errors?.[0]?.message ?? "Unknown error"
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId: input.incidentId,
				status: "ticketed",
				event: `Linear ticket failed: ${errMsg}`,
				agentName: "Triage",
			})
			return { success: false, reason: errMsg }
		} catch (e) {
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId: input.incidentId,
				status: "ticketed",
				event: "Linear API error",
				agentName: "Triage",
				detail: String(e),
			})
			return { success: false, reason: String(e) }
		}
	},
})

export const addTicketComment = createTool({
	description:
		"Add a comment to an existing Linear ticket. Use this to leave QA feedback or status updates on the ticket.",
	inputSchema: z.object({
		issueId: z
			.string()
			.describe("The Linear issue ID (UUID) to comment on"),
		body: z
			.string()
			.describe("Comment body in markdown with review feedback"),
	}),
	execute: async (_ctx, input) => {
		const linearApiKey = process.env.LINEAR_API_KEY
		if (!linearApiKey) {
			return { success: false, reason: "LINEAR_API_KEY not configured" }
		}

		try {
			const response = await fetch("https://api.linear.app/graphql", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${linearApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					query: LINEAR_CREATE_COMMENT_GQL,
					variables: { issueId: input.issueId, body: input.body },
				}),
			})

			const data = (await response.json()) as {
				data?: {
					commentCreate?: {
						success: boolean
						comment?: { id: string }
					}
				}
				errors?: Array<{ message: string }>
			}

			if (data?.data?.commentCreate?.success) {
				return { success: true }
			}
			return {
				success: false,
				reason: data?.errors?.[0]?.message ?? "Unknown error",
			}
		} catch (e) {
			return { success: false, reason: String(e) }
		}
	},
})

// ─── Notification Tools ─────────────────────────────────────────────────────

export const sendSlackNotification = createTool({
	description:
		"Send a Slack notification about the incident. Format a clear message with severity, title, summary, and ticket link.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID for tracking"),
		severity: z
			.string()
			.describe("Incident severity (critical, high, medium, low)"),
		title: z.string().describe("Incident title"),
		summary: z.string().describe("Brief summary of the incident"),
		category: z.string().describe("Incident category"),
		team: z.string().describe("Assigned team"),
		reporterName: z.string().describe("Reporter name"),
		ticketUrl: z
			.string()
			.optional()
			.describe("Linear ticket URL if available"),
		ticketNumber: z.number().optional().describe("Linear ticket number"),
	}),
	execute: async (ctx, input) => {
		const slackWebhook = process.env.SLACK_WEBHOOK_URL
		if (!slackWebhook) {
			return { success: false, reason: "SLACK_WEBHOOK_URL not configured" }
		}

		try {
			const slackPayload = {
				text: `[${input.severity.toUpperCase()}] ${input.title}`,
				blocks: [
					{
						type: "header",
						text: {
							type: "plain_text",
							text: `${input.severity.toUpperCase()} Incident`,
						},
					},
					{
						type: "section",
						text: {
							type: "mrkdwn",
							text: `*${input.title}*\n${input.summary}`,
						},
					},
					{
						type: "section",
						fields: [
							{
								type: "mrkdwn",
								text: `*Severity:* ${input.severity}`,
							},
							{
								type: "mrkdwn",
								text: `*Category:* ${input.category}`,
							},
							{
								type: "mrkdwn",
								text: `*Reporter:* ${input.reporterName}`,
							},
							{ type: "mrkdwn", text: `*Team:* ${input.team}` },
						],
					},
					...(input.ticketUrl
						? [
								{
									type: "section",
									text: {
										type: "mrkdwn",
										text: `<${input.ticketUrl}|View Linear Ticket #${input.ticketNumber}>`,
									},
								},
							]
						: []),
				],
			}

			await fetch(slackWebhook, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(slackPayload),
			})

			await ctx.runMutation(internal.incidents.addNotification, {
				incidentId: input.incidentId,
				channel: "slack",
				recipient: "#sre-incidents",
				status: "sent",
				messageBody: `[${input.severity.toUpperCase()}] ${input.title}`,
			})

			return { success: true, channel: "slack" }
		} catch (e) {
			await ctx.runMutation(internal.incidents.addNotification, {
				incidentId: input.incidentId,
				channel: "slack",
				recipient: "#sre-incidents",
				status: "failed",
				messageBody: String(e),
			})
			return { success: false, reason: String(e) }
		}
	},
})

export const sendEmailNotification = createTool({
	description:
		"Send an email notification to the incident reporter. Include incident details, analysis summary, and ticket link.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID for tracking"),
		to: z.string().describe("Recipient email address"),
		title: z.string().describe("Incident title"),
		severity: z.string().describe("Incident severity"),
		summary: z.string().describe("Analysis summary"),
		userImpact: z
			.string()
			.optional()
			.describe("Impact on users if available"),
		ticketUrl: z.string().optional().describe("Linear ticket URL"),
		ticketNumber: z.number().optional().describe("Linear ticket number"),
	}),
	execute: async (ctx, input) => {
		const resendFrom = process.env.RESEND_FROM_EMAIL
		if (!resendFrom) {
			return { success: false, reason: "RESEND_FROM_EMAIL not configured" }
		}

		const html = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #dc2626;">Incident Report Received</h2>
  <p><strong>Title:</strong> ${input.title}</p>
  <p><strong>Severity:</strong> ${input.severity.toUpperCase()}</p>
  <p><strong>Summary:</strong> ${input.summary}</p>
  ${input.userImpact ? `<p><strong>User Impact:</strong> ${input.userImpact}</p>` : ""}
  ${input.ticketUrl ? `<p><a href="${input.ticketUrl}" style="color: #2563eb;">View Linear Ticket #${input.ticketNumber}</a></p>` : ""}
  <hr />
  <p style="color: #6b7280; font-size: 12px;">Sent by Trusty SRE Agent Platform</p>
</body>
</html>`

		await ctx.runMutation(internal.agents.email.sendEmailInternal, {
			to: input.to,
			subject: `[Trusty] Incident received: ${input.title}`,
			html,
			from: resendFrom,
		})

		await ctx.runMutation(internal.incidents.addNotification, {
			incidentId: input.incidentId,
			channel: "email",
			recipient: input.to,
			status: "sent",
			messageBody: `Incident acknowledgment sent to ${input.to}`,
		})

		return { success: true, channel: "email" }
	},
})

export const sendSmsNotification = createTool({
	description:
		"Send an SMS notification for CRITICAL incidents only. Include a brief alert with the incident title and ticket link.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID for tracking"),
		to: z.string().describe("Phone number to send SMS to"),
		title: z.string().describe("Incident title"),
		ticketUrl: z.string().optional().describe("Linear ticket URL"),
	}),
	execute: async (ctx, input) => {
		const twilioFrom = process.env.TWILIO_PHONE_NUMBER
		if (!twilioFrom) {
			return {
				success: false,
				reason: "TWILIO_PHONE_NUMBER not configured",
			}
		}

		await ctx.runAction(internal.agents.email.sendSmsInternal, {
			to: input.to,
			from: twilioFrom,
			body: `[TRUSTY CRITICAL] ${input.title} — Our SRE team is investigating. Ticket: ${input.ticketUrl ?? "pending"}`,
		})

		await ctx.runMutation(internal.incidents.addNotification, {
			incidentId: input.incidentId,
			channel: "sms",
			recipient: input.to,
			status: "sent",
			messageBody: `Critical SMS sent to ${input.to}`,
		})

		return { success: true, channel: "sms" }
	},
})

// ─── Incident Tools ─────────────────────────────────────────────────────────

export const saveAnalysis = createTool({
	description:
		"Save the structured analysis results for an incident. Call this after analyzing the incident report to persist your findings.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID"),
		analysis: z.object({
			summary: z
				.string()
				.describe("2-3 sentence technical summary of the issue"),
			keyFindings: z
				.array(z.string())
				.describe("Key findings with evidence from logs"),
			errorPatterns: z
				.array(z.string())
				.describe("Specific error patterns found in logs"),
			affectedSystems: z
				.array(z.string())
				.describe("Specific service names affected"),
			userImpact: z
				.string()
				.describe("Customer-facing impact description"),
			confidence: z
				.number()
				.min(0)
				.max(1)
				.describe("Confidence score 0.0-1.0"),
		}),
		classification: z.object({
			team: z
				.string()
				.describe(
					"Responsible team: platform|payments|inventory|auth|infra|frontend",
				),
			confidence: z
				.number()
				.min(0)
				.max(1)
				.describe("Classification confidence"),
			reasoning: z
				.string()
				.describe("Why this team owns the issue"),
		}),
	}),
	execute: async (ctx, input) => {
		await ctx.runMutation(internal.incidents.updateAnalysis, {
			incidentId: input.incidentId,
			analysis: input.analysis,
			classification: input.classification,
		})

		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId: input.incidentId,
			status: "analyzing",
			event: "Analysis complete",
			agentName: "Triage",
			detail: `Confidence: ${Math.round(input.analysis.confidence * 100)}% — Team: ${input.classification.team}`,
		})

		return { success: true }
	},
})

export const updateIncidentStatus = createTool({
	description:
		"Update the status of an incident and log an event in the timeline.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID"),
		status: z
			.enum([
				"submitted",
				"analyzing",
				"ticketed",
				"notified",
				"debugging",
				"reviewing",
				"resolved",
				"failed",
			])
			.describe("New status for the incident"),
		event: z.string().describe("Event description for the timeline"),
		agentName: z.string().describe("Name of the agent making the update"),
		detail: z
			.string()
			.optional()
			.describe("Additional detail for the event"),
	}),
	execute: async (ctx, input) => {
		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId: input.incidentId,
			status: input.status,
			event: input.event,
			agentName: input.agentName,
			detail: input.detail,
		})
		return { success: true }
	},
})

export const getIncidentContext = createTool({
	description:
		"Read the current state of an incident including analysis, classification, ticket info, and QA feedback. Use this to get context before starting work.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID to read"),
	}),
	execute: async (ctx, input): Promise<Record<string, unknown>> => {
		const incident = await ctx.runQuery(internal.incidents.getInternal, {
			incidentId: input.incidentId,
		})
		if (!incident) {
			return { success: false, reason: "Incident not found" }
		}
		return {
			success: true,
			incident: {
				title: incident.title,
				description: incident.description,
				severity: incident.severity,
				category: incident.category,
				status: incident.status,
				reporterName: incident.reporterName,
				reporterEmail: incident.reporterEmail,
				rawLogs: incident.rawLogs,
				analysis: incident.analysis,
				classification: incident.classification,
				linearTicketId: incident.linearTicketId,
				linearTicketUrl: incident.linearTicketUrl,
				fixDescription: incident.fixDescription,
				fixDiff: incident.fixDiff,
				qaScore: incident.qaScore,
				qaFeedback: incident.qaFeedback,
				debugAttempts: incident.debugAttempts,
			},
		}
	},
})

export const saveFix = createTool({
	description:
		"Save the proposed fix description and diff for an incident. Call this after you have completed your debugging and code changes.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID"),
		fixDescription: z
			.string()
			.describe(
				"Clear description of what was fixed and how (1-3 paragraphs)",
			),
		fixDiff: z
			.string()
			.describe(
				"The unified diff of all changes made (output of git diff or equivalent)",
			),
	}),
	execute: async (ctx, input) => {
		await ctx.runMutation(internal.incidents.updateFix, {
			incidentId: input.incidentId,
			fixDescription: input.fixDescription,
			fixDiff: input.fixDiff,
		})

		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId: input.incidentId,
			status: "debugging",
			event: "Fix proposed",
			agentName: "Debugger",
			detail: input.fixDescription.slice(0, 200),
		})

		return { success: true }
	},
})

export const approveFix = createTool({
	description:
		"Approve a proposed fix after QA review. Use when the fix properly addresses the root cause with score >= 80.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID"),
		score: z
			.number()
			.min(0)
			.max(100)
			.describe("QA score from 0-100 (80+ means approve)"),
		feedback: z
			.string()
			.describe(
				"Review notes explaining the approval decision and any observations",
			),
	}),
	execute: async (ctx, input) => {
		await ctx.runMutation(internal.incidents.updateQaReview, {
			incidentId: input.incidentId,
			qaScore: input.score,
			qaFeedback: input.feedback,
			qaApproved: true,
		})

		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId: input.incidentId,
			status: "reviewing",
			event: `QA approved with score ${input.score}/100`,
			agentName: "QA Reviewer",
			detail: input.feedback.slice(0, 200),
		})

		return { success: true, approved: true }
	},
})

export const rejectFix = createTool({
	description:
		"Reject a proposed fix after QA review. Use when the fix has issues (score < 80). Provide detailed feedback for the debugger to address.",
	inputSchema: z.object({
		incidentId: z.string().describe("The incident ID"),
		score: z
			.number()
			.min(0)
			.max(100)
			.describe("QA score from 0-100 (below 80 means reject)"),
		feedback: z
			.string()
			.describe(
				"Detailed feedback on what needs to change — be specific about which parts of the fix are problematic and why",
			),
	}),
	execute: async (ctx, input) => {
		await ctx.runMutation(internal.incidents.updateQaReview, {
			incidentId: input.incidentId,
			qaScore: input.score,
			qaFeedback: input.feedback,
			qaApproved: false,
		})

		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId: input.incidentId,
			status: "reviewing",
			event: `QA rejected with score ${input.score}/100`,
			agentName: "QA Reviewer",
			detail: input.feedback.slice(0, 200),
		})

		return { success: true, approved: false }
	},
})
