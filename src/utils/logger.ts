const COLORS = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function timestamp() {
  return new Date().toISOString().split("T")[1].split(".")[0];
}

function log(tag: string, color: string, msg: string) {
  console.log(`${COLORS.gray}[${timestamp()}]${COLORS.reset} ${color}[${tag}]${COLORS.reset} ${msg}`);
}

export const logger = {
  gateway: (msg: string) => log("Gateway", COLORS.cyan, msg),
  policy:  (msg: string) => log("Policy", COLORS.yellow, msg),
  privacy: (msg: string) => log("Privacy", COLORS.green, msg),
  payment: (msg: string) => log("Payment", COLORS.cyan, msg),
  ledger:  (msg: string) => log("Ledger", COLORS.yellow, msg),
  error:   (msg: string) => log("Error", COLORS.red, msg),
  info:    (msg: string) => log("Info", COLORS.gray, msg),
};
