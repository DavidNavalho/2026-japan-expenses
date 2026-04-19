import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const publicFiles = [
  ".github/workflows/deploy-pages.yml",
  "README.md",
  "index.html",
  "app.js",
  "styles.css",
  "config/exchange-rate.json",
  "config/manual-expenses.json",
  "config/merchant-rules.json",
  "config/transaction-overrides.json",
  "data/public-data.json",
  "data/public-data.js",
  "dist/index.html",
  "dist/app.js",
  "dist/styles.css",
  "dist/data/public-data.json",
  "dist/data/public-data.js",
];

const bannedPatterns = [
  { label: "raw export filename", regex: /account-statement_/i },
  { label: "bank header fields", regex: /\bStarted Date\b|\bCompleted Date\b|\bBalance\b/ },
  { label: "source row metadata", regex: /\bsourceFile\b|\bsourceRow\b/ },
  { label: "owner field", regex: /"owner"\s*:/ },
  { label: "transfer descriptor", regex: /\bTransfer from\b|\bTransfer to\b/i },
  { label: "pocket withdrawal", regex: /\bPocket Withdrawal\b/i },
  { label: "person name david", regex: /\bDavid\b/i },
  { label: "person name catarina", regex: /\bCatarina\b/i },
  { label: "family surname", regex: /\bPrecatado\b|\bNavalho\b|\bMarques\b|\bFerrao\b|\bLeal\b/i },
];

const findings = [];

for (const relativePath of publicFiles) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    findings.push(`${relativePath}: missing file`);
    continue;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  for (const pattern of bannedPatterns) {
    if (pattern.regex.test(content)) {
      findings.push(`${relativePath}: matched ${pattern.label}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Privacy check failed:");
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log("Privacy check passed.");
