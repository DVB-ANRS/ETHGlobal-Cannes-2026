import { execSync } from "child_process"
import { join } from "path"
import express from "express"

const DASHBOARD_PORT = 3002
const dashboardDir = join(process.cwd(), "src/dashboard")
const esbuildBin = join(process.cwd(), "node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild")

console.log("Bundling dashboard...")
execSync(
  `${esbuildBin} ${join(dashboardDir, "app.ts")} --bundle --format=esm --outfile=${join(dashboardDir, "app.js")} --platform=browser`,
  { stdio: "inherit" }
)
console.log("Bundle ready")

const app = express()
app.use(express.static(dashboardDir))
app.listen(DASHBOARD_PORT, () => {
  console.log(`\nDashboard: http://localhost:${DASHBOARD_PORT}`)
  console.log("Open this URL in Chrome, then click 'Connect Ledger'\n")
})
