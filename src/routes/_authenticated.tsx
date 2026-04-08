import { useAuth } from "@clerk/react"
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { useQuery } from "convex/react"

import { api } from "../../convex/_generated/api"

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
		// Bootstrap user record on first sign-in
		return <BootstrapUser />
	}

	return <Outlet />
}

function BootstrapUser() {
	const { isSignedIn } = useAuth()

	if (!isSignedIn) {
		throw redirect({ to: "/sign-in" })
	}

	// User is authenticated but has no Convex record yet — auto-bootstrap
	// Call api.users.bootstrap from a child component or onboarding route
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
		</div>
	)
}
