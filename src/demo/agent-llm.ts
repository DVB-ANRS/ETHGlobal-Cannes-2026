/**
 * agent-llm.ts — Real AI agent that uses SecretPay to call paid APIs
 *
 * The agent receives a research task and autonomously decides which
 * paid APIs to call through SecretPay's gateway.
 *
 * Usage:
 *   pnpm agent
 *   pnpm agent "Get me the premium DeFi report and current ETH price"
 *
 * Requires:
 *   - SecretPay gateway running on :3000  (pnpm dev)
 *   - Mock x402 server running on :4021   (pnpm mock)
 *   - GROQ_API_KEY in .env
 */

import Groq from "groq-sdk";
import { config } from "dotenv";
import { logger } from "../utils/logger.js";

config();

const GATEWAY_URL = "http://localhost:3000";
const MOCK_API = "http://localhost:4021";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const tools: Groq.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fetch_paid_api",
      description:
        "Fetch data from a paid API. Available endpoints:\n" +
        "- GET /data ($0.10) — Real-time ETH/USD market price\n" +
        "- GET /news ($0.005) — Latest crypto news articles\n" +
        "- GET /weather ($0.02) — Current weather in Cannes\n" +
        "- GET /sentiment ($0.05) — Market sentiment & fear/greed index\n" +
        "- GET /budget-data ($0.50) — Budget-friendly market data\n" +
        "- GET /bulk-data ($1.50) — Historical 100-hour price dataset\n" +
        "- GET /premium-report ($2) — Full Q2 2026 DeFi research report",
      parameters: {
        type: "object",
        properties: {
          endpoint: {
            type: "string",
            description: "The API endpoint path, e.g. /data, /news, /sentiment",
          },
        },
        required: ["endpoint"],
      },
    },
  },
];

async function callSecretPay(endpoint: string): Promise<unknown> {
  const url = `${MOCK_API}${endpoint}`;
  logger.info(`Agent calling: ${url}`);

  const res = await fetch(`${GATEWAY_URL}/agent/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  const json = await res.json();

  if (json.payment) {
    logger.privacy(`Paid $${json.payment.amount} via burner ${json.payment.burner?.slice(0, 12)}...`);
    logger.policy(`Policy decision: ${json.payment.policy}`);
  }
  if (json.error) {
    logger.error(`${json.error} — ${json.reason ?? ""}`);
  }

  return json;
}

async function run() {
  const task =
    process.argv[2] ??
    "Give me a quick market briefing: current ETH price, latest news, and market sentiment.";

  logger.info("=== SecretPay LLM Agent ===");
  logger.info(`Task: ${task}`);
  console.log();

  const messages: Groq.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content:
        "You are a research agent. You have access to paid APIs through SecretPay. " +
        "Use the fetch_paid_api tool to gather data, then synthesize a concise answer. " +
        "Be cost-efficient: only call APIs you need. Small calls (<$1) are auto-approved. " +
        "Larger calls (>=$1) require human approval via Ledger hardware wallet.",
    },
    { role: "user", content: task },
  ];

  let done = false;

  while (!done) {
    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 1024,
      tools,
      messages,
    });

    const choice = response.choices[0];

    if (choice.finish_reason === "stop") {
      console.log(`\n${"─".repeat(60)}`);
      console.log(choice.message.content);
      console.log(`${"─".repeat(60)}\n`);
      done = true;
      continue;
    }

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        try {
          const input = JSON.parse(toolCall.function.arguments) as { endpoint: string };
          const result = await callSecretPay(input.endpoint);
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: "Failed to parse tool arguments" }),
          });
        }
      }
    } else {
      done = true;
    }
  }

  console.log();
  logger.info("=== Agent Session Summary ===");
  const history = await fetch(`${GATEWAY_URL}/agent/history`).then((r) => r.json());
  const balance = await fetch(`${GATEWAY_URL}/agent/balance`).then((r) => r.json());
  logger.info(`Transactions: ${history.payments?.length ?? 0}`);
  logger.info(`Pool balance: ${balance.balance} ${balance.unit}`);

  for (const tx of history.payments ?? []) {
    logger.payment(`${tx.policy.padEnd(12)} $${tx.amount.padStart(6)} → burner ${tx.burner?.slice(0, 12)}...`);
  }
}

run().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
