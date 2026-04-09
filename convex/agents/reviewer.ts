import { Agent, stepCountIs } from "@convex-dev/agent"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"

import { zInternalAction } from ".."
import { internal, components } from "../_generated/api"
import { approveFix, rejectFix, addTicketComment } from "./tools"

// ─── QA Reviewer Agent (Sonnet) ─────────────────────────────────────────────

const QA_PROMPT = `You are a QA code reviewer for an e-commerce platform called Trusty.
Your job is to review proposed fixes from the Debugger agent and determine if they are safe to merge.

## Your workflow:
1. Read the original incident analysis and the proposed fix carefully
2. Evaluate the fix against these criteria:
   - Does it address the ROOT CAUSE identified in the analysis?
   - Could it introduce regressions in other parts of the system?
   - Does it follow the code conventions visible in the diff context?
   - Is it minimal and targeted (no unnecessary changes)?
   - Are there any security concerns (injection, auth bypass, data exposure)?
3. Score the fix from 0-100
4. Make your decision:
   - Score >= 80: Call approve_fix — the fix is safe to merge
   - Score < 80: Call reject_fix with SPECIFIC, ACTIONABLE feedback

## Scoring guide:
- 90-100: Excellent fix, addresses root cause, no concerns
- 80-89: Good fix, minor observations but safe to merge
- 60-79: Needs improvement — specific changes required (rejection)
- 40-59: Significant issues — may not address root cause (rejection)
- 0-39: Fundamental problems — wrong approach entirely (rejection)

## When rejecting:
- Be SPECIFIC about what needs to change (file names, line numbers, logic issues)
- Explain WHY each issue is problematic
- Suggest concrete alternatives when possible
- Also add a comment to the Linear ticket using add_ticket_comment with your feedback

## SECURITY:
- Flag any changes that weaken authentication or authorization
- Flag any changes that expose sensitive data
- Flag any changes that introduce injection vulnerabilities`

const reviewerAgent = new Agent(components.agent, {
	name: "QA Reviewer",
	languageModel: anthropic("claude-sonnet-4-6"),
	instructions: QA_PROMPT,
	tools: {
		approveFix,
		rejectFix,
		addTicketComment,
	},
	stopWhen: stepCountIs(5),
})

// ─── Reviewer Action ────────────────────────────────────────────────────────

export const reviewFix = zInternalAction({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const { incidentId } = args

		const incident = await ctx.runQuery(internal.incidents.getInternal, {
			incidentId,
		})
		if (!incident) throw new Error(`Incident ${incidentId} not found`)

		// Check if there's actually a fix to review
		if (!incident.fixDiff) {
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId,
				status: "reviewing",
				event: "No fix to review — debugger did not produce a diff",
				agentName: "QA Reviewer",
			})
			// Mark as failed if no fix after debugging
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId,
				status: "failed",
				event: "Pipeline failed — no fix produced",
				agentName: "Orchestrator",
			})
			return
		}

		// Update status
		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId,
			status: "reviewing",
			event: `QA review started (attempt ${incident.debugAttempts})`,
			agentName: "QA Reviewer",
		})

		// Build prompt
		const parts = [
			`# QA Code Review`,
			`**Incident ID:** ${incidentId}`,
			`**Title:** ${incident.title}`,
			`**Severity:** ${incident.severity}`,
			`**Debug Attempt:** ${incident.debugAttempts}`,
			``,
			`## Original Analysis`,
			incident.analysis?.summary ?? incident.description,
			``,
			`### Key Findings`,
			...(incident.analysis?.keyFindings?.map((f: string) => `- ${f}`) ?? []),
			``,
			`### Error Patterns`,
			...(incident.analysis?.errorPatterns?.map((p: string) => `- \`${p}\``) ?? []),
			``,
			`### Affected Systems`,
			...(incident.analysis?.affectedSystems?.map((s: string) => `- ${s}`) ?? []),
			``,
			`## Proposed Fix`,
			`### Description`,
			incident.fixDescription ?? "No description provided",
			``,
			`### Diff`,
			"```diff",
			incident.fixDiff,
			"```",
		]

		if (incident.linearTicketId) {
			parts.push(
				``,
				`## Linear Ticket`,
				`Ticket ID: ${incident.linearTicketId}`,
				`URL: ${incident.linearTicketUrl ?? "N/A"}`,
				`If you reject the fix, add a comment to this ticket with your feedback using add_ticket_comment.`,
			)
		}

		parts.push(
			``,
			`## Instructions`,
			`Review the proposed fix against the original analysis.`,
			`- If the fix is good (score >= 80): call approve_fix with incidentId "${incidentId}"`,
			`- If the fix needs work (score < 80): call reject_fix with incidentId "${incidentId}" and detailed feedback`,
			`  - Also call add_ticket_comment with issueId "${incident.linearTicketId ?? ""}" to leave feedback on the Linear ticket`,
		)

		const prompt = parts.join("\n")

		// Create or continue thread
		let threadId: string
		if (incident.reviewerThreadId) {
			threadId = incident.reviewerThreadId
		} else {
			const thread = await reviewerAgent.createThread(ctx, {
				userId: incident.userId as string,
				title: `QA Review: ${incident.title}`,
			})
			threadId = thread.threadId

			await ctx.runMutation(internal.incidents.updateQaReview, {
				incidentId,
				qaScore: 0,
				qaFeedback: "",
				qaApproved: false,
				reviewerThreadId: threadId,
			})
		}

		try {
			await reviewerAgent.generateText(ctx, { threadId }, { prompt })
		} catch (e) {
			console.error("QA Reviewer agent failed:", e)
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId,
				status: "reviewing",
				event: "QA review failed",
				agentName: "QA Reviewer",
				detail: String(e).slice(0, 500),
			})
		}

		// Re-fetch to check QA decision
		const reviewed = await ctx.runQuery(internal.incidents.getInternal, {
			incidentId,
		})
		if (!reviewed) return

		if (reviewed.qaApproved) {
			// Fix approved — send resolution notifications
			await ctx.scheduler.runAfter(
				0,
				internal.agents.notifier.sendResolutionNotifications,
				{ incidentId },
			)
		} else if ((reviewed.debugAttempts ?? 0) < 3) {
			// Rejected but can retry — send back to debugger
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId,
				status: "reviewing",
				event: `Fix rejected — sending back to debugger (attempt ${(reviewed.debugAttempts ?? 0) + 1}/3)`,
				agentName: "Orchestrator",
			})

			await ctx.scheduler.runAfter(
				0,
				internal.agents.debugger.debugIncident,
				{ incidentId },
			)
		} else {
			// Max retries reached
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId,
				status: "failed",
				event: "Max debug attempts reached (3/3) — requires manual intervention",
				agentName: "Orchestrator",
			})
		}
	},
})
