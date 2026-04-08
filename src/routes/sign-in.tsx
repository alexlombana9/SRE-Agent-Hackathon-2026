import { SignIn } from "@clerk/react"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/sign-in")({
	component: SignInPage,
})

function SignInPage() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center">
			<div className="mb-8 text-center">
				<h1 className="text-2xl font-semibold tracking-tight">App</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Sign in to continue
				</p>
			</div>
			<SignIn
				routing="hash"
				fallbackRedirectUrl="/"
				appearance={{
					elements: {
						rootBox: "w-full max-w-sm",
						card: "shadow-none ring-1 ring-foreground/10 rounded-xl",
						socialButtonsBlockButton:
							"border border-border bg-background hover:bg-muted",
						formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90",
						footerActionLink: "text-primary",
					},
				}}
			/>
		</div>
	)
}
