import express from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import agentRouter from "./routes/agent.js";
import agentsRouter from "./routes/agents.js";
import onboardRouter from "./routes/onboard.js";
import { appConfig } from "./utils/config.js";
import { logger } from "./utils/logger.js";
import { gateway } from "./core/gateway.js";
import { privacyRouter } from "./core/privacy.js";
import { createPaymentFetch } from "./core/payment.js";
import { ledgerEmulator } from "./core/ledger.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRouter);
app.use(agentRouter);
app.use(agentsRouter);
app.use(onboardRouter);

// Ledger emulator routes (GET /ledger/pending, POST /ledger/approve, etc.)
ledgerEmulator.mountRoutes(app);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.message);
  res.status(500).json({ error: "Internal server error" });
});

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function validateEnv() {
  const required = ["UNLINK_API_KEY", "AGENT_MNEMONIC", "EVM_PRIVATE_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
}

// ── Initialize modules then start server ──
async function start() {
  validateEnv();

  // Payment module has no async init — wire it unconditionally
  gateway.setPayment({ createPaymentFetch });
  logger.info("Payment module wired ✓");

  // Ledger emulator — disabled in production (Speculos requires Docker)
  if (!IS_PRODUCTION) {
    try {
      await ledgerEmulator.init();
      gateway.setLedger(ledgerEmulator);
      logger.info("Ledger emulator initialized");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`Ledger init failed: ${msg} — running with stub ledger`);
    }
  } else {
    logger.info("Ledger disabled in production — using stub ledger");
  }

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
