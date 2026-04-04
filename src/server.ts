import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import agentRouter from "./routes/agent.js";
import { appConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { gateway } from "./core/gateway.js";
import { privacyRouter } from "./core/privacy.js";
import { createPaymentFetch } from "./core/payment.js";

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

// ── Initialize modules then start server ──
async function start() {
  // Payment module has no async init — wire it unconditionally
  gateway.setPayment({ createPaymentFetch });
  logger.info("Payment module wired ✓");

  try {
    await privacyRouter.init({
      apiKey: appConfig.unlinkApiKey,
      mnemonic: appConfig.agentMnemonic,
      evmPrivateKey: appConfig.agentEvmPrivateKey,
      rpcUrl: appConfig.rpcUrl,
    });
    gateway.setPrivacy(privacyRouter);
    logger.info("Privacy layer initialized ✓");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Privacy init failed: ${msg} — running with stub privacy`);
  }

  app.listen(appConfig.gatewayPort, () => {
    logger.info(`SecretPay Gateway on :${appConfig.gatewayPort}`);
  });
}

start();
