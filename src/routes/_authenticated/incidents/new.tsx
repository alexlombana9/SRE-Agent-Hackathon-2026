import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { IncidentForm } from "#/components/incidents/incident-form"

export const Route = createFileRoute("/_authenticated/incidents/new")({
	component: NewIncidentPage,
})

function NewIncidentPage() {
	return (
		<div className="mx-auto max-w-2xl px-4 py-8">
			<Link
				to="/incidents"
				className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Back to incidents
			</Link>
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Report an Incident</h1>
				<p className="text-sm text-muted-foreground">
					Submit an incident report — the AI agent will analyze, classify, and
					create a Linear ticket automatically.
				</p>
			</div>
			<div className="rounded-xl border bg-card p-6 shadow-sm">
				<IncidentForm />
			</div>
		</div>
	)
}
