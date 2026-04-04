import { Router } from "express";
import type { AgentRequest } from "../types/index.js";

const router = Router();

// Sera wirée vers gateway.ts à la Phase 2
router.post("/agent/request", async (req, res) => {
  const agentReq = req.body as AgentRequest;
  if (!agentReq.url) {
    res.status(400).json({ error: "url is required" });
    return;
  }
  // TODO: gateway.handleRequest(agentReq)
  res.json({ status: 200, data: null, message: "stub — gateway not wired yet" });
});

router.get("/agent/balance", async (_req, res) => {
  // TODO: privacy.getBalance()
  res.json({ balance: "0", unit: "USDC" });
});

router.get("/agent/history", (_req, res) => {
  // TODO: retourner PaymentRecord[] depuis le gateway
  res.json({ payments: [] });
});

export default router;
