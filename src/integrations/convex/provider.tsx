import { useAuth } from "@clerk/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"

import { convex } from "@/lib/query-client"

export default function ConvexProvider({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
			{children}
		</ConvexProviderWithClerk>
	)
}
