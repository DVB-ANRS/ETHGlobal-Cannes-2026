import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AgentRequest } from "../types/index.js";
import { gateway } from "../core/gateway.js";
import { privacyRouter } from "../core/privacy.js";
import { vaultManager } from "../core/vault-manager.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const router = Router();

router.post("/agent/request", async (req, res) => {
  const agentReq = req.body as AgentRequest;
  const agentAddress = req.headers["x-agent-address"] as string | undefined;
  const agentId = req.headers["x-agent-id"] as string | undefined;

  if (!agentReq.url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    if (agentAddress) {
      const resolved = vaultManager.resolveAgent(agentAddress);
      if (!resolved) {
        res.status(403).json({ error: "Agent not registered. Setup via /onboard first." });
        return;
      }
      const result = await gateway.handleRequest(agentReq, {
        agentAddress,
        agentId,
        withdrawFn: (amount: string) => vaultManager.withdrawForAgent(agentAddress, amount),
      });
      res.status(result.status).json(result);
    } else {
      const result = await gateway.handleRequest(agentReq, { agentId });
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

router.get("/agent/history", (req, res) => {
  const agentId = req.query.agentId as string | undefined;
  res.json({ payments: gateway.getHistory(agentId) });
});

router.post("/agent/deposit", async (req, res) => {
  const { amount } = req.body as { amount?: string };
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400).json({ error: "amount is required and must be a positive number" });
    return;
  }
  try {
    const balanceBefore = await privacyRouter.getBalance();
    await privacyRouter.deposit(amount);
    const balanceAfter = await privacyRouter.getBalance();
    res.json({ deposited: amount, balanceBefore, balanceAfter, unit: "USDC" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: "Deposit failed", reason: msg });
  }
});

router.get("/agent/policy", (_req, res) => {
  try {
    const raw = readFileSync(join(__dirname, "../config/policy.json"), "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    res.json({ maxPerTransaction: 2, allowedRecipients: [], blockedRecipients: [] });
  }
});

export default router;
