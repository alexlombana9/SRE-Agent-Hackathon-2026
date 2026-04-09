import { cn } from "#/lib/utils"

type Severity = "critical" | "high" | "medium" | "low"

const severityConfig: Record<
	Severity,
	{ label: string; className: string }
> = {
	critical: {
		label: "Critical",
		className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
	},
	high: {
		label: "High",
		className:
			"bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
	},
	medium: {
		label: "Medium",
		className:
			"bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
	},
	low: {
		label: "Low",
		className:
			"bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
	},
}

export function SeverityBadge({
	severity,
	className,
}: {
	severity: Severity
	className?: string
}) {
	const { label, className: severityClass } = severityConfig[severity]
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
				severityClass,
				className,
			)}
		>
			{label}
		</span>
	)
}
