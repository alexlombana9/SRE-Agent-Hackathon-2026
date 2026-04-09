import { useAuth } from "@clerk/react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

export const Route = createFileRoute("/")({
	component: IndexRedirect,
})

function IndexRedirect() {
	const { isSignedIn, isLoaded } = useAuth()
	const navigate = useNavigate()

	useEffect(() => {
		if (!isLoaded) return
		void navigate({ to: isSignedIn ? "/incidents" : "/sign-in" })
	}, [isSignedIn, isLoaded, navigate])

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
		</div>
	)
}
