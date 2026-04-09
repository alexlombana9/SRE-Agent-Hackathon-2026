import { cn } from "#/lib/utils"

type Status =
	| "submitted"
	| "analyzing"
	| "ticketed"
	| "notified"
	| "debugging"
	| "reviewing"
	| "resolved"
	| "failed"

const statusConfig: Record<
	Status,
	{ label: string; className: string; pulse?: boolean }
> = {
	submitted: {
		label: "Submitted",
		className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
	},
	analyzing: {
		label: "Analyzing",
		className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
		pulse: true,
	},
	ticketed: {
		label: "Ticketed",
		className:
			"bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
	},
	notified: {
		label: "Notified",
		className:
			"bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
	},
	debugging: {
		label: "Debugging",
		className:
			"bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
		pulse: true,
	},
	reviewing: {
		label: "Reviewing",
		className:
			"bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
	},
	resolved: {
		label: "Resolved",
		className:
			"bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
	},
	failed: {
		label: "Failed",
		className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
	},
}

export function StatusBadge({
	status,
	className,
}: {
	status: Status
	className?: string
}) {
	const { label, className: statusClass, pulse } = statusConfig[status]
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
				statusClass,
				className,
			)}
		>
			{pulse && (
				<span className="relative flex size-1.5">
					<span
						className={cn(
							"absolute inline-flex size-full animate-ping rounded-full opacity-75",
							status === "analyzing" ? "bg-blue-500" : "bg-amber-500",
						)}
					/>
					<span
						className={cn(
							"relative inline-flex size-1.5 rounded-full",
							status === "analyzing" ? "bg-blue-600" : "bg-amber-600",
						)}
					/>
				</span>
			)}
			{label}
		</span>
	)
}
