import Groq from "groq-sdk";
import { EventEmitter } from "events";
import { logger } from "../utils/logger.js";

export interface AgentConfig {
  id: string;
  name: string;
  llmApiKey: string;
  task: string;
  gatewayUrl: string;
  mockApiUrl: string;
}

export interface AgentEvent {
  type: "thinking" | "tool_call" | "payment" | "response" | "error" | "done";
  agentId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

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

export class AgentRunner extends EventEmitter {
  private config: AgentConfig;
  private client: Groq;
  private aborted = false;
  private _status: "idle" | "running" | "stopped" | "done" | "error" = "idle";

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    this.client = new Groq({ apiKey: config.llmApiKey });
  }

  get status() { return this._status; }
  get id() { return this.config.id; }
  get name() { return this.config.name; }
  get task() { return this.config.task; }

  stop() {
    this.aborted = true;
    this._status = "stopped";
    this.emitEvent("done", { reason: "stopped by user" });
  }

  async run(): Promise<void> {
    this._status = "running";
    this.aborted = false;

    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a research agent. You have access to paid APIs through SecretPay. " +
          "Use the fetch_paid_api tool to gather data, then synthesize a concise answer. " +
          "Be cost-efficient: only call APIs you need. Small calls (<$1) are auto-approved. " +
          "Larger calls (>=$1) require human approval via Ledger hardware wallet.",
      },
      { role: "user", content: this.config.task },
    ];

    this.emitEvent("thinking", { message: "Agent started" });

    try {
      let done = false;
      let iterations = 0;

      while (!done && !this.aborted && iterations < 10) {
        iterations++;

        const response = await this.client.chat.completions.create({
          model: "llama-3.1-70b-versatile",
          max_tokens: 1024,
          tools,
          messages,
        });

        const choice = response.choices[0];

        if (choice.finish_reason === "stop") {
          const text = choice.message.content ?? "";
          this.emitEvent("response", { text });
          done = true;
          continue;
        }

        if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
          messages.push(choice.message);

          for (const toolCall of choice.message.tool_calls) {
            if (this.aborted) break;

            let input: { endpoint: string };
            try {
              input = JSON.parse(toolCall.function.arguments) as { endpoint: string };
            } catch {
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: "Failed to parse tool arguments" }),
              });
              continue;
            }

            this.emitEvent("tool_call", { endpoint: input.endpoint });

            try {
              const result = await this.callGateway(input.endpoint);

              if ((result as Record<string, unknown>).payment) {
                const payment = (result as Record<string, unknown>).payment as Record<string, unknown>;
                this.emitEvent("payment", {
                  amount: payment.amount,
                  burner: payment.burner,
                  policy: payment.policy,
                  txHash: payment.txHash,
                  endpoint: input.endpoint,
                });
              }

              if ((result as Record<string, unknown>).error) {
                this.emitEvent("error", {
                  message: (result as Record<string, unknown>).error,
                  endpoint: input.endpoint,
                });
              }

              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : "Gateway unreachable";
              this.emitEvent("error", { message: msg, endpoint: input.endpoint });
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: msg }),
              });
            }
          }
        } else {
          done = true;
        }
      }

      this._status = this.aborted ? "stopped" : "done";
      this.emitEvent("done", { reason: this.aborted ? "stopped" : "completed", iterations });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this._status = "error";
      this.emitEvent("error", { message: msg });
      logger.error(`Agent ${this.config.name}: ${msg}`);
    }
  }

  private async callGateway(endpoint: string): Promise<unknown> {
    const url = `${this.config.mockApiUrl}${endpoint}`;
    logger.info(`[${this.config.name}] calling: ${url}`);

    const res = await fetch(`${this.config.gatewayUrl}/agent/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Agent-Id": this.config.id,
      },
      body: JSON.stringify({ url }),
    });

    return res.json();
  }

  private emitEvent(type: AgentEvent["type"], data: Record<string, unknown>) {
    const event: AgentEvent = {
      type,
      agentId: this.config.id,
      timestamp: Date.now(),
      data,
    };
    this.emit("event", event);
  }
}
