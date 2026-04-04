import { Router } from "express";
import { vaultManager } from "../core/vault-manager.js";

const router = Router();

// ─── POST /onboard/setup ─────────────────────────────────────────────
// Body: { walletAddress, signature }
router.post("/onboard/setup", async (req, res) => {
  const { walletAddress, signature } = req.body;
  if (!walletAddress || !signature) {
    res.status(400).json({ error: "walletAddress and signature are required" });
    return;
  }
  try {
    const result = await vaultManager.setup(walletAddress, signature);
    res.json({
      ...result,
      depositAddress: "0x647f9b99af97e4b79DD9Dd6de3b583236352f482",
      message: deriveMessage(walletAddress),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
  }
});

// ─── POST /onboard/deposit ───────────────────────────────────────────
// Body: { walletAddress, amount }
router.post("/onboard/deposit", async (req, res) => {
  const { walletAddress, amount } = req.body;
  if (!walletAddress || !amount) {
    res.status(400).json({ error: "walletAddress and amount are required" });
    return;
  }
  try {
    const result = await vaultManager.deposit(walletAddress, amount);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
  }
});

// ─── GET /onboard/balance?wallet=0x... ───────────────────────────────
router.get("/onboard/balance", async (req, res) => {
  const wallet = req.query.wallet as string;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  try {
    const balance = await vaultManager.getBalance(wallet);
    res.json({ balance, unit: "USDC" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
  }
});

// ─── POST /onboard/agents ────────────────────────────────────────────
// Body: { walletAddress, agentAddress, label?, maxPerTx?, maxPerDay? }
router.post("/onboard/agents", (req, res) => {
  const { walletAddress, agentAddress, label, maxPerTx, maxPerDay } = req.body;
  if (!walletAddress || !agentAddress) {
    res.status(400).json({ error: "walletAddress and agentAddress are required" });
    return;
  }
  try {
    const agent = vaultManager.addAgent(walletAddress, agentAddress, {
      label,
      maxPerTx,
      maxPerDay,
    });
    res.json({ added: true, agent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
  }
});

// ─── DELETE /onboard/agents/:address ─────────────────────────────────
router.delete("/onboard/agents/:address", (req, res) => {
  const wallet = req.query.wallet as string;
  const agentAddress = req.params.address;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  try {
    vaultManager.removeAgent(wallet, agentAddress);
    res.json({ removed: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
  }
});

// ─── GET /onboard/agents?wallet=0x... ────────────────────────────────
router.get("/onboard/agents", (req, res) => {
  const wallet = req.query.wallet as string;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  try {
    const agents = vaultManager.listAgents(wallet);
    res.json({ agents });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: msg });
  }
});

// ─── GET /onboard/message?wallet=0x... ───────────────────────────────
// Returns the message the frontend must sign
router.get("/onboard/message", (req, res) => {
  const wallet = req.query.wallet as string;
  if (!wallet) {
    res.status(400).json({ error: "wallet query param required" });
    return;
  }
  res.json({ message: deriveMessage(wallet) });
});

function deriveMessage(wallet: string): string {
  return vaultManager.deriveMessage(wallet);
}

export default router;
