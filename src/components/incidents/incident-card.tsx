import { Link } from "@tanstack/react-router"
import type { Doc } from "../../../convex/_generated/dataModel"
import { cn } from "#/lib/utils"
import { SeverityBadge } from "./severity-badge"
import { StatusBadge } from "./status-badge"

function timeAgo(ms: number): string {
	const diff = Date.now() - ms
	const mins = Math.floor(diff / 60000)
	if (mins < 1) return "just now"
	if (mins < 60) return `${mins}m ago`
	const hrs = Math.floor(mins / 60)
	if (hrs < 24) return `${hrs}h ago`
	return `${Math.floor(hrs / 24)}d ago`
}

export function IncidentCard({
	incident,
	className,
}: {
	incident: Doc<"incidents">
	className?: string
}) {
	return (
		<Link
			to="/incidents/$id"
			params={{ id: incident._id }}
			className={cn(
				"block rounded-lg border bg-card p-3 shadow-xs transition-colors hover:bg-accent/50",
				incident.awaitingApproval && "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20",
				className,
			)}
		>
			<div className="mb-2 flex items-start gap-2">
				<SeverityBadge severity={incident.severity} />
				{incident.awaitingApproval ? (
					<span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
						Awaiting Approval
					</span>
				) : (
					<StatusBadge status={incident.status} />
				)}
			</div>
			<p className="mb-1 line-clamp-2 text-sm font-medium leading-snug">
				{incident.title}
			</p>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>{incident.reporterName}</span>
				<span>{timeAgo(incident._creationTime)}</span>
			</div>
		</Link>
	)
}
