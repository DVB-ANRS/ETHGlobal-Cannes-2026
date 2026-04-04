import { policyEngine } from "../src/core/policy.js"

policyEngine.loadConfig()

console.log("=== Policy Engine Tests ===\n")

const tests: Array<{ label: string; amount: number; recipient: string; expected: string }> = [
  { label: "Micro-paiement", amount: 0.01, recipient: "0xGoodService", expected: "auto" },
  { label: "Gros montant", amount: 10, recipient: "0xGoodService", expected: "ledger" },
  { label: "Blacklisted", amount: 0.01, recipient: "0xShadyService000000000000000000000000dead", expected: "denied" },
  { label: "Hard cap", amount: 150, recipient: "0xGoodService", expected: "denied" },
  { label: "Montant négatif", amount: -1, recipient: "0xGoodService", expected: "denied" },
  { label: "Montant zéro", amount: 0, recipient: "0xGoodService", expected: "denied" },
]

let pass = 0
for (const t of tests) {
  const result = policyEngine.evaluate(t.amount, t.recipient)
  const ok = result === t.expected
  if (ok) pass++
  console.log(`${ok ? "✓" : "✗"} ${t.label}: $${t.amount} → ${result} (expected: ${t.expected})`)
}

console.log("\n--- Daily limit test ---")
policyEngine.recordSpending(48)
const result = policyEngine.evaluate(3, "0xGoodService")
const ok = result === "ledger"
if (ok) pass++
console.log(`${ok ? "✓" : "✗"} After $48 spent: $3 → ${result} (expected: ledger)`)

console.log(`\n${pass}/${tests.length + 1} tests passed`)
