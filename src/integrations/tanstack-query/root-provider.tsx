import { queryClient } from "@/lib/query-client"

export function getContext() {
	return { queryClient }
}

export default function TanstackQueryProvider() {}
