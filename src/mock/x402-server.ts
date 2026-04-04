import express from "express";
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { appConfig } from "../utils/config.js";
import { logger } from "../utils/logger.js";

const app = express();

// 1. Create facilitator client for payment verification/settlement
const facilitator = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

// 2. Create resource server with EVM exact scheme for Base Sepolia
const resourceServer = new x402ResourceServer(facilitator).register(
  "eip155:84532",
  new ExactEvmScheme()
);

// 3. Define paid routes with pricing
const routes = {
  "GET /data": {
    accepts: {
      scheme: "exact" as const,
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress as `0x${string}`,
      price: "$0.01",
    },
    description: "Real-time market data",
  },
  "GET /news": {
    accepts: {
      scheme: "exact" as const,
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress as `0x${string}`,
      price: "$0.005",
    },
    description: "Latest crypto news",
  },
  "GET /bulk-data": {
    accepts: {
      scheme: "exact" as const,
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress as `0x${string}`,
      price: "$10",
    },
    description: "Historical bulk dataset",
  },
  "GET /weather": {
    accepts: {
      scheme: "exact" as const,
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress as `0x${string}`,
      price: "$0.02",
    },
    description: "Current weather data",
  },
  "GET /sentiment": {
    accepts: {
      scheme: "exact" as const,
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress as `0x${string}`,
      price: "$0.05",
    },
    description: "Market sentiment analysis",
  },
  "GET /premium-report": {
    accepts: {
      scheme: "exact" as const,
      network: "eip155:84532" as const,
      payTo: appConfig.mockReceiverAddress as `0x${string}`,
      price: "$2",
    },
    description: "Premium research report",
  },
};

// 4. Apply x402 payment middleware before route handlers
app.use(
  paymentMiddleware(routes, resourceServer, { testnet: true }, undefined, true)
);

// 5. Route handlers — only reached after payment is verified
app.get("/data", (_req, res) => {
  logger.payment("Serving /data (paid $0.01)");
  res.json({
    symbol: "ETH/USD",
    price: 3847.52,
    timestamp: new Date().toISOString(),
    source: "SecretPay Mock API",
  });
});

app.get("/news", (_req, res) => {
  logger.payment("Serving /news (paid $0.005)");
  res.json({
    articles: [
      {
        title: "ETH Breaks $4000",
        date: "2026-04-04",
        source: "CoinDesk",
      },
      {
        title: "Base L2 Hits 100M Tx",
        date: "2026-04-03",
        source: "The Block",
      },
    ],
  });
});

app.get("/bulk-data", (_req, res) => {
  logger.payment("Serving /bulk-data (paid $10)");
  const data = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    pair: "ETH/USD",
    price: 3800 + Math.random() * 100,
    volume: Math.floor(Math.random() * 1000000),
    timestamp: new Date(Date.now() - i * 3600000).toISOString(),
  }));
  res.json({ data, count: data.length });
});

app.get("/weather", (_req, res) => {
  logger.payment("Serving /weather (paid $0.02)");
  res.json({
    city: "Cannes",
    temp: 24,
    condition: "Sunny",
    humidity: 55,
    timestamp: new Date().toISOString(),
  });
});

app.get("/sentiment", (_req, res) => {
  logger.payment("Serving /sentiment (paid $0.05)");
  res.json({
    overall: "bullish",
    fearGreedIndex: 72,
    topMentions: ["ETH", "BASE", "USDC"],
    timestamp: new Date().toISOString(),
  });
});

app.get("/premium-report", (_req, res) => {
  logger.payment("Serving /premium-report (paid $2)");
  res.json({
    title: "Q2 2026 DeFi Outlook",
    summary: "DeFi TVL continues to grow, driven by L2 adoption and real-world asset tokenization.",
    sections: ["Market Overview", "L2 Analysis", "RWA Trends", "Risk Assessment"],
    pages: 42,
    timestamp: new Date().toISOString(),
  });
});

// 6. Health check (not paywalled)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "x402-mock-api" });
});

// 7. Start server
app.listen(appConfig.mockServerPort, () => {
  logger.info(`x402 Mock API running on :${appConfig.mockServerPort}`);
  logger.payment(`Receiver: ${appConfig.mockReceiverAddress}`);
  logger.payment(
    "Endpoints: /data ($0.01), /news ($0.005), /weather ($0.02), /sentiment ($0.05), /premium-report ($2), /bulk-data ($10)"
  );
});
