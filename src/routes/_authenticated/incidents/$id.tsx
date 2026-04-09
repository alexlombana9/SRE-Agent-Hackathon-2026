import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { AgentTrail } from "#/components/incidents/agent-trail"
import { SeverityBadge } from "#/components/incidents/severity-badge"
import { StatusBadge } from "#/components/incidents/status-badge"

export const Route = createFileRoute("/_authenticated/incidents/$id")({
	component: IncidentDetailPage,
})

function IncidentDetailPage() {
	const { id } = Route.useParams()
	const incident = useQuery(api.incidents.get, { incidentId: id })

	if (incident === undefined) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-8">
				<div className="space-y-4">
					<div className="h-8 w-64 animate-pulse rounded bg-muted" />
					<div className="h-4 w-40 animate-pulse rounded bg-muted" />
					<div className="h-40 animate-pulse rounded-xl bg-muted" />
				</div>
			</div>
		)
	}

	if (!incident) {
		return (
			<div className="mx-auto max-w-4xl px-4 py-20 text-center">
				<AlertCircle className="mx-auto mb-4 size-10 text-muted-foreground" />
				<h2 className="text-lg font-semibold">Incident not found</h2>
				<Link to="/incidents" className="mt-4 text-sm text-primary underline">
					Back to incidents
				</Link>
			</div>
		)
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-8">
			<Link
				to="/incidents"
				className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to incidents
			</Link>

			<div className="mb-6">
				<div className="mb-2 flex flex-wrap items-center gap-2">
					<SeverityBadge severity={incident.severity} />
					{incident.awaitingApproval ? (
						<span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
							Awaiting Approval
						</span>
					) : (
						<StatusBadge status={incident.status} />
					)}
					<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
						{incident.category}
					</span>
				</div>
				<h1 className="text-2xl font-bold">{incident.title}</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Reported by {incident.reporterName} ({incident.reporterEmail})
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-3">
				{/* Left: incident details + analysis */}
				<div className="space-y-6 lg:col-span-2">
					<section className="rounded-xl border bg-card p-5">
						<h2 className="mb-3 font-semibold">Description</h2>
						<p className="whitespace-pre-wrap text-sm text-muted-foreground">
							{incident.description}
						</p>
					</section>

					{incident.analysis && (
						<section className="rounded-xl border bg-card p-5">
							<h2 className="mb-3 font-semibold">Agent Analysis</h2>
							<p className="mb-4 text-sm">{incident.analysis.summary}</p>
							<div className="grid gap-4 sm:grid-cols-2">
								{incident.analysis.keyFindings.length > 0 && (
									<div>
										<h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Key Findings
										</h3>
										<ul className="space-y-1">
											{incident.analysis.keyFindings.map((f) => (
												<li key={f} className="text-xs text-muted-foreground">
													• {f}
												</li>
											))}
										</ul>
									</div>
								)}
								{incident.analysis.affectedSystems.length > 0 && (
									<div>
										<h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
											Affected Systems
										</h3>
										<div className="flex flex-wrap gap-1">
											{incident.analysis.affectedSystems.map((s) => (
												<span
													key={s}
													className="rounded-md bg-muted px-2 py-0.5 text-xs"
												>
													{s}
												</span>
											))}
										</div>
									</div>
								)}
							</div>
							{incident.analysis.userImpact && (
								<div className="mt-4 rounded-lg bg-muted/50 p-3">
									<h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										User Impact
									</h3>
									<p className="text-xs">{incident.analysis.userImpact}</p>
								</div>
							)}
							{incident.classification && (
								<div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
									<span className="rounded-full bg-muted px-2 py-0.5 font-medium">
										{incident.classification.team}
									</span>
									<span>{incident.classification.reasoning}</span>
								</div>
							)}
						</section>
					)}

					{incident.rawLogs && (
						<section className="rounded-xl border bg-card p-5">
							<h2 className="mb-3 font-semibold">Raw Logs</h2>
							<pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
								{incident.rawLogs}
							</pre>
						</section>
					)}
				</div>

				{/* Right: agent trail */}
				<div className="space-y-4">
					<section className="rounded-xl border bg-card p-5">
						<h2 className="mb-4 font-semibold">Agent Trail</h2>
						<AgentTrail incident={incident} />
					</section>
				</div>
			</div>
		</div>
	)
}
