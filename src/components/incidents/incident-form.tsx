import { useForm } from "@tanstack/react-form"
import { useMutation } from "convex/react"
import { useNavigate } from "@tanstack/react-router"
import { AlertTriangle, Upload, X } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import { Button } from "#/components/ui/button"
import { Input } from "#/components/ui/input"
import { Textarea } from "#/components/ui/textarea"
import { Label } from "#/components/ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select"
import { cn } from "#/lib/utils"

const INJECTION_PATTERNS =
	/ignore previous|system prompt|you are now|act as|disregard|override|forget.*instructions/i

interface AttachedFile {
	name: string
	size: number
	storageId: string
}

export function IncidentForm() {
	const navigate = useNavigate()
	const createIncident = useMutation(api.incidents.create)
	const generateUploadUrl = useMutation(api.storage.generateUploadUrl)

	const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
	const [uploadingFile, setUploadingFile] = useState(false)
	const [injectionWarning, setInjectionWarning] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	function checkInjection(text: string) {
		setInjectionWarning(INJECTION_PATTERNS.test(text))
	}

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (!file || attachedFiles.length >= 3) return
		if (file.size > 5 * 1024 * 1024) {
			setError("File must be under 5MB")
			return
		}

		setUploadingFile(true)
		try {
			const uploadUrl = await generateUploadUrl()
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type || "application/octet-stream" },
				body: file,
			})
			if (!response.ok) throw new Error("Upload failed")
			const { storageId } = (await response.json()) as { storageId: string }
			setAttachedFiles((prev) => [
				...prev,
				{ name: file.name, size: file.size, storageId },
			])
		} catch (err) {
			setError("File upload failed. Try again.")
		} finally {
			setUploadingFile(false)
			e.target.value = ""
		}
	}

	const form = useForm({
		defaultValues: {
			title: "",
			description: "",
			severity: "high" as "critical" | "high" | "medium" | "low",
			category: "other" as
				| "payment"
				| "checkout"
				| "inventory"
				| "auth"
				| "performance"
				| "infra"
				| "other",
			reporterName: "",
			reporterEmail: "",
			reporterPhone: "",
			rawLogs: "",
		},
		onSubmit: async ({ value }) => {
			if (submitting) return
			setSubmitting(true)
			setError(null)
			try {
				const incidentId = await createIncident({
					title: value.title,
					description: value.description,
					severity: value.severity,
					category: value.category,
					reporterName: value.reporterName,
					reporterEmail: value.reporterEmail,
					reporterPhone: value.reporterPhone || undefined,
					rawLogs: value.rawLogs || undefined,
					attachmentIds: attachedFiles.map((f) => f.storageId),
				})
				void navigate({ to: "/incidents/$id", params: { id: incidentId } })
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to submit incident")
			} finally {
				setSubmitting(false)
			}
		},
	})

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault()
				void form.handleSubmit()
			}}
			className="space-y-6"
		>
			{/* Injection guard */}
			{injectionWarning && (
				<div className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<span>
						Guardrail: suspicious content detected. Input will be sanitized before
						processing.
					</span>
				</div>
			)}

			{error && (
				<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			)}

			{/* Reporter info */}
			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="reporterName">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor={field.name}>Your name *</Label>
							<Input
								id={field.name}
								placeholder="Maria Gonzalez"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								required
							/>
						</div>
					)}
				</form.Field>
				<form.Field name="reporterEmail">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor={field.name}>Your email *</Label>
							<Input
								id={field.name}
								type="email"
								placeholder="you@company.com"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								required
							/>
						</div>
					)}
				</form.Field>
			</div>

			<form.Field name="reporterPhone">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor={field.name}>
							Phone{" "}
							<span className="text-xs text-muted-foreground">
								(critical incidents — SMS alerts)
							</span>
						</Label>
						<Input
							id={field.name}
							type="tel"
							placeholder="+1 555 000 0000"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</div>
				)}
			</form.Field>

			{/* Incident details */}
			<form.Field name="title">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor={field.name}>Incident title *</Label>
						<Input
							id={field.name}
							placeholder="Brief summary of the issue"
							maxLength={200}
							value={field.state.value}
							onChange={(e) => {
								field.handleChange(e.target.value)
								checkInjection(e.target.value)
							}}
							required
						/>
						<p className="text-right text-xs text-muted-foreground">
							{field.state.value.length} / 200
						</p>
					</div>
				)}
			</form.Field>

			<form.Field name="description">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor={field.name}>Description *</Label>
						<Textarea
							id={field.name}
							rows={5}
							placeholder="Describe what happened, when, expected behavior, and steps to reproduce…"
							maxLength={5000}
							value={field.state.value}
							onChange={(e) => {
								field.handleChange(e.target.value)
								checkInjection(e.target.value)
							}}
							required
						/>
						<p className="text-right text-xs text-muted-foreground">
							{field.state.value.length} / 5000
						</p>
					</div>
				)}
			</form.Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="severity">
					{(field) => (
						<div className="space-y-1.5">
							<Label>Severity *</Label>
							<Select
								value={field.state.value}
								onValueChange={(v) =>
									field.handleChange(
										v as "critical" | "high" | "medium" | "low",
									)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="critical">Critical — service down</SelectItem>
									<SelectItem value="high">High — major feature broken</SelectItem>
									<SelectItem value="medium">Medium — degraded service</SelectItem>
									<SelectItem value="low">Low — minor issue</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>

				<form.Field name="category">
					{(field) => (
						<div className="space-y-1.5">
							<Label>Category *</Label>
							<Select
								value={field.state.value}
								onValueChange={(v) =>
									field.handleChange(
										v as
											| "payment"
											| "checkout"
											| "inventory"
											| "auth"
											| "performance"
											| "infra"
											| "other",
									)
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="payment">Payment</SelectItem>
									<SelectItem value="checkout">Checkout</SelectItem>
									<SelectItem value="inventory">Inventory</SelectItem>
									<SelectItem value="auth">Auth</SelectItem>
									<SelectItem value="performance">Performance</SelectItem>
									<SelectItem value="infra">Infrastructure</SelectItem>
									<SelectItem value="other">Other</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</form.Field>
			</div>

			<form.Field name="rawLogs">
				{(field) => (
					<div className="space-y-1.5">
						<Label htmlFor={field.name}>
							Raw logs{" "}
							<span className="text-xs text-muted-foreground">(optional)</span>
						</Label>
						<Textarea
							id={field.name}
							rows={6}
							placeholder="Paste error logs, stack traces, or relevant log lines here…"
							className="font-mono text-xs"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
						/>
					</div>
				)}
			</form.Field>

			{/* File upload */}
			<div className="space-y-1.5">
				<Label>
					Attachments{" "}
					<span className="text-xs text-muted-foreground">
						(up to 3 files, 5MB each — PNG, JPG, TXT, LOG, JSON)
					</span>
				</Label>
				<div
					className={cn(
						"rounded-lg border-2 border-dashed p-4",
						attachedFiles.length > 0 ? "border-green-400 bg-green-50/50 dark:bg-green-950/20" : "border-border",
					)}
				>
					{attachedFiles.length > 0 && (
						<div className="mb-3 flex flex-wrap gap-2">
							{attachedFiles.map((f) => (
								<div
									key={f.storageId}
									className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
								>
									<span className="max-w-[140px] truncate">{f.name}</span>
									<span className="text-muted-foreground">
										({Math.round(f.size / 1024)}KB)
									</span>
									<button
										type="button"
										onClick={() =>
											setAttachedFiles((prev) =>
												prev.filter((x) => x.storageId !== f.storageId),
											)
										}
										className="ml-1 text-muted-foreground hover:text-foreground"
									>
										<X className="size-3" />
									</button>
								</div>
							))}
						</div>
					)}
					{attachedFiles.length < 3 && (
						<label className="flex cursor-pointer items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
							<Upload className="size-4" />
							<span>
								{uploadingFile
									? "Uploading…"
									: attachedFiles.length > 0
										? "Add another file"
										: "Click to upload files"}
							</span>
							<input
								type="file"
								accept=".png,.jpg,.jpeg,.gif,.txt,.log,.json"
								className="hidden"
								disabled={uploadingFile}
								onChange={handleFileChange}
							/>
						</label>
					)}
				</div>
			</div>

			<Button type="submit" className="w-full" disabled={submitting || uploadingFile}>
				{submitting ? "Submitting…" : "Submit incident report"}
			</Button>
		</form>
	)
}
