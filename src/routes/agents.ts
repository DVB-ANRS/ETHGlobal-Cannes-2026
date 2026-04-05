import { Router } from "express";
import { AgentRunner, type AgentEvent } from "../core/agent-runner.js";
import { gateway } from "../core/gateway.js";
import { logger } from "../utils/logger.js";

const router = Router();

const agents = new Map<string, AgentRunner>();

// POST /agents/create — Create and optionally start an agent
router.post("/agents/create", (req, res) => {
  const { name, llmApiKey, task, autoStart } = req.body as {
    name?: string;
    llmApiKey?: string;
    task?: string;
    autoStart?: boolean;
  };

  if (!name || !llmApiKey || !task) {
    res.status(400).json({ error: "name, llmApiKey, and task are required" });
    return;
  }

  const id = crypto.randomUUID().slice(0, 8);
  const runner = new AgentRunner({
    id,
    name,
    llmApiKey,
    task,
    gatewayUrl: `http://localhost:${process.env.GATEWAY_PORT ?? "3000"}`,
    mockApiUrl: `http://localhost:${process.env.MOCK_SERVER_PORT ?? "4021"}`,
  });

  agents.set(id, runner);
  logger.info(`Agent "${name}" created (${id})`);

  if (autoStart) {
    runner.run();
    logger.info(`Agent "${name}" started`);
  }

  res.json({ id, name, status: runner.status });
});

// GET /agents — List all agents
router.get("/agents", (_req, res) => {
  const list = Array.from(agents.values()).map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    task: a.task,
  }));
  res.json({ agents: list });
});

// POST /agents/:id/run — Start an agent
router.post("/agents/:id/run", (req, res) => {
  const runner = agents.get(req.params.id);
  if (!runner) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  if (runner.status === "running") {
    res.status(409).json({ error: "Agent already running" });
    return;
  }

  runner.run();
  logger.info(`Agent "${runner.name}" started`);
  res.json({ id: runner.id, status: "running" });
});

// POST /agents/:id/stop — Stop an agent
router.post("/agents/:id/stop", (req, res) => {
  const runner = agents.get(req.params.id);
  if (!runner) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  runner.stop();
  logger.info(`Agent "${runner.name}" stopped`);
  res.json({ id: runner.id, status: "stopped" });
});

// DELETE /agents/:id — Remove an agent
router.delete("/agents/:id", (req, res) => {
  const runner = agents.get(req.params.id);
  if (!runner) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  if (runner.status === "running") runner.stop();
  agents.delete(req.params.id);
  logger.info(`Agent "${runner.name}" deleted`);
  res.json({ ok: true });
});

// GET /agents/:id/history — Payment history for this agent
router.get("/agents/:id/history", (req, res) => {
  const runner = agents.get(req.params.id);
  if (!runner) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json({ payments: gateway.getHistory(req.params.id) });
});

// GET /agents/:id/events — SSE stream of agent events
router.get("/agents/:id/events", (req, res) => {
  const runner = agents.get(req.params.id);
  if (!runner) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const onEvent = (event: AgentEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  runner.on("event", onEvent);

  req.on("close", () => {
    runner.off("event", onEvent);
  });
});

export default router;
