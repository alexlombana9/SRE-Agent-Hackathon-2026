import { z } from "zod"

import { zInternalAction } from ".."
import { internal } from "../_generated/api"

// ─── Pipeline Orchestrator ──────────────────────────────────────────────────
// Thin coordinator that kicks off the triage agent.
// The triage agent chains to debugger, which chains to reviewer.
// Each phase is a separate action to avoid timeout issues.

export const runPipeline = zInternalAction({
	args: z.object({ incidentId: z.string() }),
	handler: async (ctx, args) => {
		const { incidentId } = args

		await ctx.runMutation(internal.incidents.updateStatus, {
			incidentId,
			status: "analyzing",
			event: "Pipeline started",
			agentName: "Orchestrator",
		})

		try {
			await ctx.runAction(internal.agents.triage.triageIncident, {
				incidentId,
			})
		} catch (e) {
			console.error("Triage failed:", e)
			await ctx.runMutation(internal.incidents.updateStatus, {
				incidentId,
				status: "failed",
				event: "Triage failed",
				agentName: "Orchestrator",
				detail: String(e).slice(0, 500),
			})
		}
	},
})
