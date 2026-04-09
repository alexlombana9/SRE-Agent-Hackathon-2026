import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation } from "convex/react"
import { useMemo } from "react"
import { api } from "../../../convex/_generated/api"
import type { Doc } from "../../../convex/_generated/dataModel"
import {
	Kanban,
	KanbanBoard,
	KanbanColumn,
	KanbanColumnContent,
	KanbanColumnHandle,
	KanbanItem,
	KanbanItemHandle,
	KanbanOverlay,
	type KanbanMoveEvent,
} from "#/components/ui/kanban"
import { IncidentCard } from "#/components/incidents/incident-card"

export const Route = createFileRoute("/_authenticated/board")({
	component: BoardPage,
})

type ColumnName = "Open" | "In Progress" | "Awaiting Approval" | "Resolved"

const COLUMN_ORDER: ColumnName[] = [
	"Open",
	"In Progress",
	"Awaiting Approval",
	"Resolved",
]

const COLUMN_STYLES: Record<ColumnName, string> = {
	"Open": "border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30",
	"In Progress": "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30",
	"Awaiting Approval": "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
	"Resolved": "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/30",
}

const IN_PROGRESS_STATUSES = new Set([
	"analyzing",
	"ticketed",
	"notified",
	"debugging",
	"reviewing",
])

function incidentToColumn(incident: Doc<"incidents">): ColumnName {
	if (incident.awaitingApproval) return "Awaiting Approval"
	if (incident.status === "resolved") return "Resolved"
	if (IN_PROGRESS_STATUSES.has(incident.status)) return "In Progress"
	return "Open"
}

const COLUMN_TO_STATUS: Record<ColumnName, "submitted" | "notified" | "resolved"> = {
	"Open": "submitted",
	"In Progress": "notified",
	"Awaiting Approval": "notified",
	"Resolved": "resolved",
}

export function BoardPage() {
	const incidents = useQuery(api.incidents.list)
	const updateStatus = useMutation(api.incidents.updateStatusPublic)

	const columns = useMemo<Record<ColumnName, Doc<"incidents">[]>>(() => {
		const result: Record<ColumnName, Doc<"incidents">[]> = {
			"Open": [],
			"In Progress": [],
			"Awaiting Approval": [],
			"Resolved": [],
		}
		for (const incident of incidents ?? []) {
			result[incidentToColumn(incident)].push(incident)
		}
		return result
	}, [incidents])

	function handleMove({ activeContainer, overContainer, activeIndex }: KanbanMoveEvent) {
		const fromCol = activeContainer as ColumnName
		const toCol = overContainer as ColumnName

		if (fromCol === toCol) return
		if (toCol === "Awaiting Approval") return // Read-only

		const incident = columns[fromCol][activeIndex]
		if (!incident) return
		if (incident.awaitingApproval) return

		const newStatus = COLUMN_TO_STATUS[toCol]
		void updateStatus({ incidentId: incident._id, newStatus })
	}

	return (
		<div className="px-4 py-8">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Incident Board</h1>
				<p className="text-sm text-muted-foreground">
					{incidents === undefined
						? "Loading…"
						: `${incidents.length} incident${incidents.length !== 1 ? "s" : ""} total`}
				</p>
			</div>

			{incidents === undefined ? (
				<div className="grid grid-cols-4 gap-4">
					{COLUMN_ORDER.map((col) => (
						<div key={col} className="h-64 animate-pulse rounded-xl border bg-muted" />
					))}
				</div>
			) : (
				<Kanban
					value={columns}
					onValueChange={() => {}}
					onMove={handleMove}
					getItemValue={(incident) => incident._id}
				>
					<KanbanBoard className="grid-cols-4 items-start">
						{COLUMN_ORDER.map((col) => (
							<KanbanColumn
								key={col}
								value={col}
								disabled={col === "Awaiting Approval"}
								className={`rounded-xl border p-3 ${COLUMN_STYLES[col]}`}
							>
								<KanbanColumnHandle className="mb-3 flex items-center justify-between">
									<h2 className="text-sm font-semibold">{col}</h2>
									<span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground">
										{columns[col].length}
									</span>
								</KanbanColumnHandle>
								<KanbanColumnContent value={col}>
									{columns[col].map((incident) => (
										<KanbanItem
											key={incident._id}
											value={incident._id}
											disabled={col === "Awaiting Approval"}
										>
											<KanbanItemHandle>
												<IncidentCard incident={incident} />
											</KanbanItemHandle>
										</KanbanItem>
									))}
									{columns[col].length === 0 && (
										<div className="flex h-16 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
											No incidents
										</div>
									)}
								</KanbanColumnContent>
							</KanbanColumn>
						))}
					</KanbanBoard>
					<KanbanOverlay>
						<div className="h-24 rotate-2 rounded-lg border bg-card shadow-lg opacity-80" />
					</KanbanOverlay>
				</Kanban>
			)}
		</div>
	)
}
