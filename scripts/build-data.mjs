import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const rootDir = process.cwd();
const configDir = path.join(rootDir, "config");
const outputDir = path.join(rootDir, "data");
const distDir = path.join(rootDir, "dist");

const merchantConfig = readJson(path.join(configDir, "merchant-rules.json"));
const overridesConfig = readJson(path.join(configDir, "transaction-overrides.json"));
const manualExpensesConfig = readJson(path.join(configDir, "manual-expenses.json"));
const exchangeRateConfig = readJson(path.join(configDir, "exchange-rate.json"));

const transactions = merchantConfig.accounts.flatMap((account) =>
  parseCsvFile(account.file).map((row, index) =>
    normalizeTransaction({
      row,
      index,
      file: account.file,
      rules: merchantConfig.rules,
      overrides: overridesConfig.overrides,
    }),
  ),
);

const manualExpenses = (manualExpensesConfig.expenses ?? []).map((expense, index) =>
  normalizeManualExpense(expense, index),
);

const physicalCashTransactions = transactions.filter(
  (transaction) => transaction.classification === "cash-withdrawal",
);
const purchaseTransactions = transactions.filter(
  (transaction) =>
    transaction.includeInTrackedSpend &&
    transaction.amountJPY < 0 &&
    transaction.classification !== "cash-withdrawal",
);
const excludedTransactions = transactions.filter(
  (transaction) => !transaction.includeInTrackedSpend,
);
const reviewTransactions = [
  ...transactions.filter((transaction) => transaction.review),
  ...manualExpenses.filter((expense) => expense.review),
];

const trackedItems = [...purchaseTransactions, ...manualExpenses];
const totalSpendItems = [...trackedItems, ...physicalCashTransactions];
const tripStart = minimumDate(totalSpendItems.map((item) => item.date));
const tripEnd = maximumDate(totalSpendItems.map((item) => item.date));
const purchaseSpendTotal = sumAbs(trackedItems);
const physicalCashTotal = sumAbs(physicalCashTransactions);
const totalSpendJPY = purchaseSpendTotal + physicalCashTotal;
const tripDays = tripStart && tripEnd ? inclusiveDays(tripStart, tripEnd) : 0;
const averagePerDay = tripDays ? totalSpendJPY / tripDays : 0;

const categoryTotals = summarizeBy(totalSpendItems, (item) => item.category, true)
  .map((entry) => {
    const template = totalSpendItems.find((item) => item.category === entry.key);
    return {
      category: entry.key,
      label: categoryLabel(entry.key),
      group: template?.group ?? "Other",
      totalJPY: entry.total,
      count: entry.count,
      percentOfTotalSpend: totalSpendJPY ? entry.total / totalSpendJPY : 0,
    };
  })
  .sort((left, right) => right.totalJPY - left.totalJPY);

const groupTotals = summarizeBy(totalSpendItems, (item) => item.group, true)
  .map((entry) => ({
    group: entry.key,
    totalJPY: entry.total,
    count: entry.count,
  }))
  .sort((left, right) => right.totalJPY - left.totalJPY);

const merchantTotals = summarizeBy(
  totalSpendItems,
  (item) => item.normalizedMerchant || item.description,
  true,
)
  .map((entry) => {
    const sample = totalSpendItems.find(
      (item) => (item.normalizedMerchant || item.description) === entry.key,
    );
    return {
      merchant: entry.key,
      totalJPY: entry.total,
      count: entry.count,
      category: sample?.category ?? "uncategorized",
    };
  })
  .sort((left, right) => right.totalJPY - left.totalJPY)
  .slice(0, 20);

const dailyTotals = summarizeBy(
  totalSpendItems,
  (item) => item.date,
  true,
)
  .map((entry) => ({
    date: entry.key,
    totalJPY: entry.total,
    count: entry.count,
  }))
  .sort((left, right) => left.date.localeCompare(right.date));

const ambiguousTransactions = reviewTransactions
  .map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    normalizedMerchant: transaction.normalizedMerchant,
    amountJPY: Math.abs(transaction.amountJPY),
    category: transaction.category,
    classification: transaction.classification,
    notes: transaction.notes,
    source: transaction.source,
  }))
  .sort((left, right) => right.amountJPY - left.amountJPY);

const excludedSummary = summarizeBy(
  excludedTransactions.filter((transaction) => transaction.amountJPY < 0),
  (transaction) => transaction.classification,
  true,
).map((entry) => ({
  classification: entry.key,
  label: classificationLabel(entry.key),
  totalJPY: entry.total,
  count: entry.count,
}));

const output = {
  generatedAt: new Date().toISOString(),
  currency: "JPY",
  fx: exchangeRateConfig,
  sourceFiles: merchantConfig.accounts.map((account) => ({
    file: account.file,
  })),
  tripWindow: {
    start: tripStart,
    end: tripEnd,
    days: tripDays,
  },
  summary: {
    totalSpendJPY,
    purchaseSpendJPY: purchaseSpendTotal,
    trackedTransactionCount: totalSpendItems.length,
    physicalCashJPY: physicalCashTotal,
    physicalCashCount: physicalCashTransactions.length,
    excludedOutflowJPY: excludedSummary.reduce((sum, entry) => sum + entry.totalJPY, 0),
    reviewCount: ambiguousTransactions.length,
    averagePerDayJPY: Math.round(averagePerDay),
    manualExpenseCount: manualExpenses.length,
  },
  categoryTotals,
  groupTotals,
  merchantTotals,
  dailyTotals,
  excludedSummary,
  transactions,
  manualExpenses,
  reviewTransactions: ambiguousTransactions,
};

const publicOutput = {
  generatedAt: output.generatedAt,
  currency: output.currency,
  fx: output.fx,
  tripWindow: output.tripWindow,
  summary: output.summary,
  categoryTotals: output.categoryTotals,
  groupTotals: output.groupTotals,
  merchantTotals: output.merchantTotals,
  dailyTotals: output.dailyTotals,
  excludedSummary: output.excludedSummary,
  manualExpenses: output.manualExpenses.map((expense) => ({
    date: expense.date,
    startDate: expense.startDate ?? expense.date,
    endDate: expense.endDate ?? expense.date,
    description: expense.description,
    normalizedMerchant: expense.normalizedMerchant,
    amountJPY: Math.abs(expense.amountJPY),
    category: expense.category,
    classification: expense.classification,
    notes: expense.notes,
    sourceAmount: expense.sourceAmount ?? null,
    sourceCurrency: expense.sourceCurrency ?? "JPY",
    sourceAmountJPY: expense.sourceAmountJPY ?? Math.abs(expense.amountJPY),
  })),
  reviewTransactions: output.reviewTransactions.map((transaction) => ({
    date: transaction.date,
    description: transaction.description,
    normalizedMerchant: transaction.normalizedMerchant,
    amountJPY: transaction.amountJPY,
    category: transaction.category,
    classification: transaction.classification,
    notes: transaction.notes,
  })),
};

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  path.join(outputDir, "processed-data.json"),
  `${JSON.stringify(output, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDir, "processed-data.js"),
  `window.TRIP_DATA = ${JSON.stringify(output, null, 2)};\n`,
);
fs.writeFileSync(
  path.join(outputDir, "public-data.json"),
  `${JSON.stringify(publicOutput, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(outputDir, "public-data.js"),
  `window.TRIP_DATA = ${JSON.stringify(publicOutput, null, 2)};\n`,
);
prepareDist(publicOutput);

console.log(
  [
    `Total spend: ${formatJPY(totalSpendJPY)}`,
    `Purchases: ${formatJPY(purchaseSpendTotal)}`,
    `Physical cash: ${formatJPY(physicalCashTotal)}`,
    `Review items: ${ambiguousTransactions.length}`,
    `Manual expenses: ${manualExpenses.length}`,
  ].join("\n"),
);

function parseCsvFile(fileName) {
  const content = fs.readFileSync(path.join(rootDir, fileName), "utf8").trim();
  const lines = content.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === "\"") {
      if (insideQuotes && nextChar === "\"") {
        current += "\"";
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === "," && !insideQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function normalizeTransaction({ row, index, file, rules, overrides }) {
  const amountJPY = Number(row.Amount);
  const base = {
    id: hashValues([file, row["Started Date"], row["Completed Date"], row.Description, row.Amount]),
    source: "bank-export",
    sourceFile: file,
    sourceRow: index + 2,
    dateTime: row["Started Date"] || row["Completed Date"],
    date: (row["Started Date"] || row["Completed Date"]).slice(0, 10),
    startedAt: row["Started Date"],
    completedAt: row["Completed Date"],
    description: row.Description,
    normalizedMerchant: row.Description,
    type: row.Type,
    product: row.Product,
    amountJPY,
    absoluteAmountJPY: Math.abs(amountJPY),
    currency: row.Currency,
    state: row.State,
    includeInTrackedSpend: row.Type === "Card Payment" && amountJPY < 0,
    classification: row.Type === "Card Payment" ? "expense" : slugify(row.Type),
    category: row.Type === "Card Payment" ? "uncategorized" : "internal-movement",
    group: row.Type === "Card Payment" ? "Needs Review" : "Excluded",
    review: false,
    notes: "",
  };

  const ruleMatched = applyRuleSet(base, rules);
  const overrideMatched = applyRuleSet(ruleMatched, overrides);
  return {
    ...overrideMatched,
    amountJPY: Number(overrideMatched.amountJPY),
    absoluteAmountJPY: Math.abs(Number(overrideMatched.amountJPY)),
    includeInTrackedSpend:
      Boolean(overrideMatched.includeInTrackedSpend) && Number(overrideMatched.amountJPY) < 0,
    review:
      overrideMatched.review ||
      (overrideMatched.includeInTrackedSpend && overrideMatched.category === "uncategorized"),
  };
}

function normalizeManualExpense(expense, index) {
  const sourceCurrency = expense.sourceCurrency || "JPY";
  const sourceAmount = Number(
    expense.sourceAmount ?? expense.originalAmount ?? expense.amountJPY ?? expense.amount ?? 0,
  );
  const amountJPY =
    expense.amountJPY != null
      ? Number(expense.amountJPY)
      : convertToJPY({
          amount: sourceAmount,
          currency: sourceCurrency,
        });
  const date = expense.date;
  const signedAmountJPY = amountJPY <= 0 ? amountJPY : -amountJPY;

  return {
    id: expense.id || `manual-${index + 1}`,
    source: "manual-entry",
    sourceFile: "config/manual-expenses.json",
    sourceRow: index + 1,
    dateTime: `${date} 00:00:00`,
    date,
    startDate: expense.startDate || date,
    endDate: expense.endDate || date,
    startedAt: `${date} 00:00:00`,
    completedAt: `${date} 00:00:00`,
    description: expense.description || "Manual expense",
    normalizedMerchant: expense.normalizedMerchant || expense.description || "Manual expense",
    type: "Manual Expense",
    product: "Manual",
    amountJPY: signedAmountJPY,
    absoluteAmountJPY: Math.abs(signedAmountJPY),
    currency: "JPY",
    sourceCurrency,
    sourceAmount,
    sourceAmountJPY:
      sourceCurrency === "JPY" ? Math.abs(sourceAmount) : Math.abs(convertToJPY({ amount: sourceAmount, currency: sourceCurrency })),
    conversionRate: sourceCurrency === "EUR" ? exchangeRateConfig.rates.JPY_PER_EUR : 1,
    state: "MANUAL",
    includeInTrackedSpend: true,
    classification: expense.classification || "manual-expense",
    category: expense.category || "uncategorized",
    group: expense.group || "Needs Review",
    review: Boolean(expense.review),
    notes:
      expense.notes ||
      "Manual expense added because the cost is missing from the bank exports.",
  };
}

function applyRuleSet(transaction, rules) {
  return rules.reduce((current, rule) => {
    if (!matchesRule(current, rule.match)) {
      return current;
    }

    return {
      ...current,
      ...rule.set,
    };
  }, transaction);
}

function matchesRule(transaction, match = {}) {
  return Object.entries(match).every(([key, value]) => {
    if (key === "descriptionContains") {
      return transaction.description.toLowerCase().includes(String(value).toLowerCase());
    }

    if (key === "amount") {
      return transaction.amountJPY === Number(value);
    }

    return transaction[key] === value;
  });
}

function summarizeBy(items, keyFn, useAbsoluteAmount = false) {
  const totals = new Map();

  for (const item of items) {
    const key = keyFn(item);
    const previous = totals.get(key) ?? { key, total: 0, count: 0 };
    const amount = useAbsoluteAmount ? Math.abs(item.amountJPY) : item.amountJPY;
    totals.set(key, {
      key,
      total: previous.total + amount,
      count: previous.count + 1,
    });
  }

  return [...totals.values()];
}

function minimumDate(dates) {
  return dates.length ? [...dates].sort()[0] : null;
}

function maximumDate(dates) {
  return dates.length ? [...dates].sort().at(-1) : null;
}

function inclusiveDays(start, end) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const diff = endDate.getTime() - startDate.getTime();
  return Math.floor(diff / 86400000) + 1;
}

function sumAbs(items) {
  return items.reduce((sum, item) => sum + Math.abs(item.amountJPY), 0);
}

function categoryLabel(category) {
  return category
    .split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function classificationLabel(classification) {
  return categoryLabel(classification);
}

function formatJPY(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(value);
}

function hashValues(values) {
  return crypto.createHash("sha1").update(values.join("|")).digest("hex").slice(0, 12);
}

function slugify(value) {
  return value.toLowerCase().replace(/\s+/g, "-");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function convertToJPY({ amount, currency }) {
  if (currency === "JPY") {
    return Math.round(amount);
  }

  if (currency === "EUR") {
    return Math.round(amount * exchangeRateConfig.rates.JPY_PER_EUR);
  }

  throw new Error(`Unsupported source currency: ${currency}`);
}

function prepareDist(publicOutput) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(distDir, "data"), { recursive: true });
  fs.copyFileSync(path.join(rootDir, "index.html"), path.join(distDir, "index.html"));
  fs.copyFileSync(path.join(rootDir, "app.js"), path.join(distDir, "app.js"));
  fs.copyFileSync(path.join(rootDir, "styles.css"), path.join(distDir, "styles.css"));
  fs.writeFileSync(path.join(distDir, ".nojekyll"), "");
  fs.writeFileSync(
    path.join(distDir, "data", "public-data.js"),
    `window.TRIP_DATA = ${JSON.stringify(publicOutput, null, 2)};\n`,
  );
  fs.writeFileSync(
    path.join(distDir, "data", "public-data.json"),
    `${JSON.stringify(publicOutput, null, 2)}\n`,
  );
}
