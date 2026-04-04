import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import agentRouter from "./routes/agent.js";
import { appConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(agentRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(appConfig.gatewayPort, () => {
  logger.info(`SecretPay Gateway on :${appConfig.gatewayPort}`);
});
