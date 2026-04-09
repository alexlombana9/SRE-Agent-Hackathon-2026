import { useQuery, useMutation } from "convex/react"
import { ExternalLink, CheckCircle, AlertTriangle } from "lucide-react"
import type { Doc } from "../../../convex/_generated/dataModel"
import { api } from "../../../convex/_generated/api"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

const agentColors: Record<string, string> = {
	Analyzer: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
	Ticketer: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
	Notifier: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
	Orchestrator: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
	Human: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
}

function timeAgo(ms: number): string {
	const diff = Date.now() - ms
	const mins = Math.floor(diff / 60000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins}m ago`
	const hrs = Math.floor(mins / 60)
	if (hrs < 24) return `${hrs}h ago`
	return `${Math.floor(hrs / 24)}d ago`
}

const ACTIVE_STATUSES = new Set([
	"submitted",
	"analyzing",
	"ticketed",
	"notified",
	"debugging",
	"reviewing",
])

export function AgentTrail({ incident }: { incident: Doc<"incidents"> }) {
	const events = useQuery(api.incidents.getEvents, {
		incidentId: incident._id,
	})
	const approve = useMutation(api.incidents.updateApproval)

	const isActive = ACTIVE_STATUSES.has(incident.status) && !incident.awaitingApproval

	return (
		<div className="space-y-4">
			{/* Human gate banner */}
			{incident.awaitingApproval && (
				<div className="rounded-lg border border-amber-400 bg-amber-50 p-4 dark:bg-amber-950/30">
					<div className="mb-2 flex items-center gap-2">
						<AlertTriangle className="size-4 text-amber-600" />
						<p className="font-semibold text-amber-800 dark:text-amber-300">
							Critical Incident — Awaiting Approval
						</p>
					</div>
					<p className="mb-3 text-sm text-amber-700 dark:text-amber-400">
						Review the analysis below before escalating to the team and creating a
						Linear ticket.
					</p>
					<Button
						size="sm"
						onClick={() => void approve({ incidentId: incident._id })}
						className="bg-amber-600 text-white hover:bg-amber-700"
					>
						Approve & Create Ticket
					</Button>
				</div>
			)}

			{/* Linear ticket link */}
			{incident.linearTicketUrl && (
				<a
					href={incident.linearTicketUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2 rounded-lg border bg-indigo-50 px-4 py-3 text-sm text-indigo-700 transition-colors hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400"
				>
					<ExternalLink className="size-4" />
					<span className="font-medium">
						Linear #{incident.linearTicketNumber}
					</span>
					<span className="text-indigo-500">— {incident.linearTicketUrl}</span>
				</a>
			)}

			{/* Timeline */}
			<div className="relative">
				{events === undefined ? (
					<div className="space-y-3">
						{[1, 2, 3].map((i) => (
							<div key={i} className="flex gap-3">
								<div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
								<div className="h-6 flex-1 animate-pulse rounded bg-muted" />
							</div>
						))}
					</div>
				) : events.length === 0 ? (
					<p className="text-sm text-muted-foreground">No events yet.</p>
				) : (
					<ol className="relative space-y-1 border-l border-border pl-4">
						{events.map((event) => (
							<li key={event._id} className="pb-3">
								<div className="absolute -left-1.5 mt-1.5 size-3 rounded-full border border-background bg-border" />
								<div className="flex flex-wrap items-baseline gap-2">
									{event.agentName && (
										<span
											className={cn(
												"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
												agentColors[event.agentName] ??
													"bg-muted text-muted-foreground",
											)}
										>
											{event.agentName}
										</span>
									)}
									<span className="text-sm font-medium">{event.event}</span>
									<span className="text-xs text-muted-foreground">
										{timeAgo(event._creationTime)}
									</span>
								</div>
								{event.detail && (
									<p className="mt-0.5 text-xs text-muted-foreground">
										{event.detail}
									</p>
								)}
							</li>
						))}
					</ol>
				)}

				{/* Active indicator */}
				{isActive && (
					<div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
							<span className="relative inline-flex size-2 rounded-full bg-blue-500" />
						</span>
						Pipeline running…
					</div>
				)}

				{incident.status === "resolved" && (
					<div className="mt-3 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
						<CheckCircle className="size-4" />
						Incident resolved
					</div>
				)}
			</div>
		</div>
	)
}
