import { Router } from "express";
import type { AgentRequest } from "../types/index.js";
import { gateway } from "../core/gateway.js";

const router = Router();

router.post("/agent/request", async (req, res) => {
  const agentReq = req.body as AgentRequest;
  if (!agentReq.url) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  try {
    const result = await gateway.handleRequest(agentReq);
    res.status(result.status).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ status: 500, error: "Gateway error", reason: msg });
  }
});

router.get("/agent/balance", async (_req, res) => {
  try {
    const balance = await gateway.getBalance();
    res.json({ balance, unit: "USDC" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Failed to get balance", reason: msg });
  }
});

router.get("/agent/history", (_req, res) => {
  res.json({ payments: gateway.getHistory() });
});

export default router;
