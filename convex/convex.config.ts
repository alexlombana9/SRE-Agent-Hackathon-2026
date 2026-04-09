import { defineApp } from "convex/server"
import agent from "@convex-dev/agent/convex.config"
import resend from "@convex-dev/resend/convex.config"
import twilio from "@convex-dev/twilio/convex.config"

const app = defineApp()
app.use(agent)
app.use(resend)
app.use(twilio)

export default app
