import { Router } from "express";
import type { AgentRequest } from "../types/index.js";
import { gateway } from "../core/gateway.js";
import { vaultManager } from "../core/vault-manager.js";

const router = Router();

router.post("/agent/request", async (req, res) => {
  const agentReq = req.body as AgentRequest;
  const agentAddress = req.headers["x-agent-address"] as string | undefined;

  if (!agentReq.url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    // If agent address provided, use multi-user vault system
    if (agentAddress) {
      const resolved = vaultManager.resolveAgent(agentAddress);
      if (!resolved) {
        res.status(403).json({ error: "Agent not registered. Setup via /onboard first." });
        return;
      }
      const result = await gateway.handleRequest(agentReq, {
        agentAddress,
        withdrawFn: (amount: string) => vaultManager.withdrawForAgent(agentAddress, amount),
      });
      res.status(result.status).json(result);
    } else {
      // Fallback: use default gateway (legacy single-user mode)
      const result = await gateway.handleRequest(agentReq);
      res.status(result.status).json(result);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ status: 500, error: "Gateway error", reason: msg });
  }
});

router.get("/agent/balance", async (req, res) => {
  const agentAddress = req.headers["x-agent-address"] as string | undefined;
  try {
    if (agentAddress) {
      const balance = await vaultManager.getBalanceForAgent(agentAddress);
      res.json({ balance, unit: "USDC" });
    } else {
      const balance = await gateway.getBalance();
      res.json({ balance, unit: "USDC" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Failed to get balance", reason: msg });
  }
});

router.get("/agent/history", (_req, res) => {
  res.json({ payments: gateway.getHistory() });
});

export default router;
