import { useAuth, UserButton } from "@clerk/react"
import { Outlet, createFileRoute, Link, redirect, useMatchRoute } from "@tanstack/react-router"
import { useQuery, useMutation } from "convex/react"
import { LayoutList, LayoutDashboard, Plus } from "lucide-react"
import { useEffect } from "react"

import { api } from "../../convex/_generated/api"
import { Button } from "#/components/ui/button"
import { cn } from "#/lib/utils"

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async ({ location }) => {
		void location
	},
	component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
	const { isSignedIn, isLoaded } = useAuth()
	const me = useQuery(api.users.me)

	if (!isLoaded || me === undefined) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
			</div>
		)
	}

	if (!isSignedIn) {
		throw redirect({ to: "/sign-in" })
	}

	if (!me) {
		return <BootstrapUser />
	}

	return (
		<div className="flex min-h-screen flex-col">
			<AppNav />
			<main className="flex-1">
				<Outlet />
			</main>
		</div>
	)
}

function AppNav() {
	const matchRoute = useMatchRoute()
	const isBoard = !!matchRoute({ to: "/board" })

	return (
		<header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
				<div className="flex items-center gap-4">
					<span className="text-base font-bold tracking-tight">Trusty SRE</span>
					<nav className="flex items-center gap-1">
						<Link
							to="/incidents"
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
								!isBoard
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<LayoutList className="size-4" />
							Incidents
						</Link>
						<Link
							to="/board"
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
								isBoard
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							<LayoutDashboard className="size-4" />
							Board
						</Link>
					</nav>
				</div>
				<div className="flex items-center gap-3">
					<Link to="/incidents/new">
						<Button size="sm" className="gap-1.5">
							<Plus className="size-4" />
							Report Incident
						</Button>
					</Link>
					<UserButton />
				</div>
			</div>
		</header>
	)
}

function BootstrapUser() {
	const { isSignedIn } = useAuth()
	const bootstrap = useMutation(api.users.bootstrap)

	useEffect(() => {
		void bootstrap()
	}, [bootstrap])

	if (!isSignedIn) {
		throw redirect({ to: "/sign-in" })
	}

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
		</div>
	)
}
