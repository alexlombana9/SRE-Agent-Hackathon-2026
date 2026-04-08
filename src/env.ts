import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {
		VITE_CONVEX_URL: z.url(),
		VITE_CLERK_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
		VITE_APP_TITLE: z.string().min(1).optional(),
	},
	runtimeEnvStrict: {
		VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
		VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
		VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
	},
	emptyStringAsUndefined: true,
})
