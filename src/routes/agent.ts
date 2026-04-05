import { Router } from "express";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AgentRequest } from "../types/index.js";
import { gateway } from "../core/gateway.js";
import { privacyRouter } from "../core/privacy.js";
import { vaultManager } from "../core/vault-manager.js";

// ── In-memory log buffer for SSE ──
interface LogEntry {
  ts: number;
  tag: string;
  msg: string;
  level: "info" | "success" | "warn" | "error" | "payment";
}
const logBuffer: LogEntry[] = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sseClients = new Set<any>();

export function pushLog(tag: string, msg: string, level: LogEntry["level"] = "info") {
  const entry: LogEntry = { ts: Date.now(), tag, msg, level };
  logBuffer.push(entry);
  if (logBuffer.length > 500) logBuffer.shift();
  const data = JSON.stringify(entry);
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); } catch { sseClients.delete(res); }
  }
}

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

// ── SSE log stream ──
router.get("/agent/logs", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  // Send buffered logs since cursor
  const cursor = parseInt(req.query.since as string) || 0;
  const recent = logBuffer.filter(e => e.ts > cursor);
  for (const entry of recent) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// ── Agent run trigger ──
interface RunConfig {
  name: string;
  provider: "groq" | "openai";
  apiKey: string;
  task: string;
}

const MOCK_BASE = process.env.MOCK_SERVER_URL ?? "http://localhost:4021";

router.post("/agent/run", async (req, res) => {
  const config = req.body as RunConfig;
  if (!config.name || !config.provider || !config.apiKey || !config.task) {
    res.status(400).json({ error: "name, provider, apiKey, task required" });
    return;
  }

  res.json({ ok: true, message: "Agent started" });

  // Run async, don't await
  runAgentFlow(config).catch((err: Error) => {
    pushLog("Error", err.message, "error");
  });
});

async function runAgentFlow(config: RunConfig) {
  const task = config.task.toLowerCase();

  pushLog("Agent", `${config.name} connected via ${config.provider.toUpperCase()}`, "success");
  pushLog("Agent", `Task: "${config.task}"`, "info");
  pushLog("Gateway", "SecretPay middleware active — Base Sepolia", "info");

  await delay(600);

  // Determine which use cases to run based on task keywords
  const runAuto   = task.includes("auto") || task.includes("data") || task.includes("cheap") || task.includes("small") || !task.includes("ledger");
  const runLedger = task.includes("ledger") || task.includes("bulk") || task.includes("large") || task.includes("big") || task.includes("all");
  const runDeny   = task.includes("deny") || task.includes("block") || task.includes("blacklist") || task.includes("all");

  // Always run at least auto
  if (runAuto || (!runLedger && !runDeny)) {
    await runUseCase({
      label: "UC1 — Auto-approve ($0.10)",
      url: `${MOCK_BASE}/data`,
      expectedPolicy: "auto",
    });
    await delay(800);
  }

  if (runLedger) {
    await runUseCase({
      label: "UC2 — Ledger approve ($1.50)",
      url: `${MOCK_BASE}/bulk-data`,
      expectedPolicy: "ledger",
    });
    await delay(800);
  }

  if (runDeny) {
    await runUseCase({
      label: "UC3 — Denied (cap exceeded)",
      url: `${MOCK_BASE}/premium-data`,
      expectedPolicy: "denied",
    });
    await delay(400);
  }

  pushLog("Agent", `Task complete — ${config.name} shutting down`, "success");
}

async function runUseCase({ label, url, expectedPolicy }: { label: string; url: string; expectedPolicy: string }) {
  pushLog("Agent", `→ ${label}`, "payment");
  pushLog("Gateway", `POST /agent/request { url: "${url}" }`, "info");

  try {
    const gatewayBase = process.env.GATEWAY_INTERNAL_URL ?? `http://localhost:${process.env.PORT ?? process.env.GATEWAY_PORT ?? "3000"}`;
    const res = await fetch(`${gatewayBase}/agent/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json() as {
      payment?: { policy: string; amount: string; burner: string; txHash?: string };
      error?: string;
      reason?: string;
    };

    if (data.payment) {
      const p = data.payment;
      pushLog("Policy", `Decision: ${p.policy.toUpperCase()}`, p.policy === "auto" ? "success" : p.policy === "ledger" ? "warn" : "error");
      pushLog("Payment", `Amount: $${p.amount} USDC`, "payment");
      if (p.burner) pushLog("Privacy", `Burner: ${p.burner.slice(0, 10)}...${p.burner.slice(-6)}`, "info");
      if (p.txHash) pushLog("Chain", `Tx: ${p.txHash.slice(0, 16)}...`, "success");
      pushLog("Gateway", `← ${res.status} OK`, "success");
    } else if (data.error) {
      const isExpectedDeny = expectedPolicy === "denied";
      pushLog("Policy", `Decision: DENIED — ${data.reason ?? data.error}`, isExpectedDeny ? "warn" : "error");
      pushLog("Gateway", `← ${res.status} ${data.error}`, isExpectedDeny ? "warn" : "error");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushLog("Error", `Request failed: ${msg}`, "error");
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default router;
