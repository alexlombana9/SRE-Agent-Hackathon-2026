import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { Plus, AlertCircle } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { IncidentCard } from "#/components/incidents/incident-card"
import { Button } from "#/components/ui/button"

export const Route = createFileRoute("/_authenticated/incidents/")({
	component: IncidentsList,
})

function IncidentsList() {
	const incidents = useQuery(api.incidents.list)

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Incidents</h1>
					<p className="text-sm text-muted-foreground">
						{incidents === undefined
							? "Loading…"
							: `${incidents.length} incident${incidents.length !== 1 ? "s" : ""}`}
					</p>
				</div>
				<Link to="/incidents/new">
					<Button className="gap-1.5">
						<Plus className="size-4" />
						Report Incident
					</Button>
				</Link>
			</div>

			{incidents === undefined ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{[1, 2, 3].map((i) => (
						<div
							key={i}
							className="h-28 animate-pulse rounded-lg border bg-muted"
						/>
					))}
				</div>
			) : incidents.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
					<AlertCircle className="mb-4 size-10 text-muted-foreground" />
					<h2 className="mb-1 text-lg font-semibold">No incidents yet</h2>
					<p className="mb-6 text-sm text-muted-foreground">
						When something breaks, report it here and the AI agent will triage
						it automatically.
					</p>
					<Link to="/incidents/new">
						<Button>Report your first incident</Button>
					</Link>
				</div>
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{incidents.map((incident) => (
						<IncidentCard key={incident._id} incident={incident} />
					))}
				</div>
			)}
		</div>
	)
}
