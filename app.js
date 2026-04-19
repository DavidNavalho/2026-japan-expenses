const state = {
  currency: "JPY",
};

(function renderDashboard() {
  const data = window.TRIP_DATA;

  if (!data) {
    document.body.innerHTML = "<p>Processed data not found. Run `node scripts/build-data.mjs` first.</p>";
    return;
  }

  attachCurrencyToggle();
  renderAll(data);
})();

function renderAll(data) {
  renderSnapshot(data);
  renderCategories(data);
  renderTimeline(data);
  renderLodgingTrack(data);
  renderManualExpenses(data);
  renderMerchants(data);
  renderReview(data);
  renderExcluded(data);
  renderNextSteps(data);
}

function renderSnapshot(data) {
  const biggestCategory = data.categoryTotals[0];
  const snapshot = document.getElementById("snapshot");
  const fxNote = data.fx?.source?.notes ?? "";
  const fxDate = data.fx?.source?.publishedDate ?? "";

  snapshot.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Snapshot</h2>
        <p class="panel-intro">
          This is a single shared-trip view. Total spend includes both recorded purchases and physical cash withdrawn during the trip.
        </p>
      </div>
      <div class="currency-switcher" role="tablist" aria-label="Currency toggle">
        ${currencyButton("JPY", "Yen")}
        ${currencyButton("EUR", "Euro")}
      </div>
    </div>
    <p class="panel-intro">
      Showing values in <strong>${escapeHtml(state.currency)}</strong>.
      ${escapeHtml(fxNote)}
      ${fxDate ? ` Rate date: ${escapeHtml(fxDate)}.` : ""}
    </p>
    <div class="kpi-grid">
      ${kpiCard("Total spend", formatMoney(data.summary.totalSpendJPY, data))}
      ${kpiCard("Non-cash spend", formatMoney(data.summary.purchaseSpendJPY, data))}
      ${kpiCard("Physical cash", formatMoney(data.summary.physicalCashJPY, data))}
      ${kpiCard("Trip window", `${data.tripWindow.start} to ${data.tripWindow.end}`)}
      ${kpiCard("Average per day", formatMoney(data.summary.averagePerDayJPY, data))}
      ${kpiCard(
        "Largest category",
        biggestCategory
          ? `${biggestCategory.label} · ${formatMoney(biggestCategory.totalJPY, data)}`
          : "None",
      )}
    </div>
  `;
}

function renderCategories(data) {
  const categories = document.getElementById("categories");
  const maxValue = Math.max(...data.categoryTotals.map((entry) => entry.totalJPY), 1);

  categories.innerHTML = `
    <h2>By category</h2>
    <p class="panel-intro">
      First-pass categorization from merchant rules. Anything uncertain stays visible in the review queue.
    </p>
    <div class="stack">
      ${data.categoryTotals
        .slice(0, 10)
        .map(
          (entry, index) => `
            <div class="row">
              <div class="row-header">
                <strong>${escapeHtml(entry.label)}</strong>
                <span>${formatMoney(entry.totalJPY, data)} · ${Math.round(entry.percentOfTotalSpend * 100)}%</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill ${index % 3 === 1 ? "alt" : index % 3 === 2 ? "soft" : ""}" style="width: ${percent(entry.totalJPY, maxValue)}%"></div>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTimeline(data) {
  const timeline = document.getElementById("timeline");
  const maxValue = Math.max(...data.dailyTotals.map((entry) => entry.totalJPY), 1);

  timeline.innerHTML = `
    <h2>Daily spend</h2>
    <p class="panel-intro">
      Totals per day across both exports and any manual entries you add later.
    </p>
    <div class="timeline">
      <div class="timeline-bars">
        ${data.dailyTotals
          .map(
            (entry) => `
              <div class="timeline-column" style="--bar-height: ${Math.max(percent(entry.totalJPY, maxValue), 6)}%">
                <strong>${shortMoney(entry.totalJPY, data)}</strong>
                <span>${escapeHtml(entry.date.slice(5))}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderMerchants(data) {
  const merchants = document.getElementById("merchants");

  merchants.innerHTML = `
    <h2>Top merchants</h2>
    <p class="panel-intro">
      Useful for spotting large one-off spends, repeat stores, and anything worth splitting into a more precise category.
    </p>
    <div class="list">
      <div class="list-header">
        <span>Merchant</span>
        <span>Category</span>
        <span>Count</span>
        <span>Total</span>
      </div>
      ${data.merchantTotals
        .map(
          (entry) => `
            <div class="table-row">
              <div><strong>${escapeHtml(entry.merchant)}</strong></div>
              <span>${escapeHtml(labelize(entry.category))}</span>
              <span>${entry.count}</span>
              <strong>${formatMoney(entry.totalJPY, data)}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderManualExpenses(data) {
  const manualExpenses = document.getElementById("manual-expenses");
  const nonLodgingManualExpenses =
    data.manualExpenses?.filter((entry) => entry.category !== "lodging") ?? [];

  manualExpenses.innerHTML = `
    <h2>Prebooked Costs</h2>
    <p class="panel-intro">
      Flights, tours, and other prebooked items keep their original source amount when that amount was recorded in EUR, while totals are still rolled up in JPY behind the scenes.
    </p>
    <div class="list">
      <div class="list-header manual-list">
        <span>Item</span>
        <span>Source amount</span>
        <span>Converted total</span>
        <span>Category</span>
      </div>
      ${
        nonLodgingManualExpenses.length
          ? nonLodgingManualExpenses
              .map(
                (entry) => `
                  <div class="table-row manual-list">
                    <div>
                      <strong>${escapeHtml(entry.normalizedMerchant)}</strong>
                      <div class="merchant-breakdown">${escapeHtml(entry.date)} · ${escapeHtml(entry.description)}</div>
                    </div>
                    <span>${formatSourceAmount(entry)}</span>
                    <strong>${formatMoney(entry.amountJPY, data)}</strong>
                    <span>${escapeHtml(labelize(entry.category))}</span>
                  </div>
                `,
              )
              .join("")
          : '<div class="table-row manual-list"><strong>No manual expenses yet.</strong><span></span><span></span><span></span></div>'
      }
    </div>
  `;
}

function renderLodgingTrack(data) {
  const lodgingTrack = document.getElementById("lodging-track");
  const lodgingEntries =
    data.manualExpenses?.filter((entry) => entry.category === "lodging") ?? [];

  lodgingTrack.innerHTML = `
    <h2>Lodging Track</h2>
    <p class="panel-intro">
      Stay segments across the trip, showing the booked date range, original source amount, and converted dashboard total.
    </p>
    <div class="list">
      <div class="list-header lodging-list">
        <span>Stay</span>
        <span>Segment</span>
        <span>Source amount</span>
        <span>Converted total</span>
      </div>
      ${
        lodgingEntries.length
          ? lodgingEntries
              .map(
                (entry) => `
                  <div class="table-row lodging-list">
                    <div>
                      <strong>${escapeHtml(entry.normalizedMerchant)}</strong>
                      <div class="merchant-breakdown">${escapeHtml(entry.description)}</div>
                    </div>
                    <span>${escapeHtml(formatStayRange(entry))}</span>
                    <span>${formatSourceAmount(entry)}</span>
                    <strong>${formatMoney(entry.amountJPY, data)}</strong>
                  </div>
                `,
              )
              .join("")
          : '<div class="table-row lodging-list"><strong>No lodging stays added.</strong><span></span><span></span><span></span></div>'
      }
    </div>
  `;
}

function renderReview(data) {
  const review = document.getElementById("review");

  review.innerHTML = `
    <h2>Needs review</h2>
    <p class="panel-intro">
      These are the transactions where the merchant is unclear, the category is only a best guess, or cash still needs allocating.
    </p>
    <div class="list review-list">
      <div class="list-header">
        <span>Transaction</span>
        <span>Amount</span>
        <span>Why it is here</span>
      </div>
      ${data.reviewTransactions.length
        ? data.reviewTransactions
            .map(
              (entry) => `
                <div class="table-row">
                <div>
                  <strong>${escapeHtml(entry.normalizedMerchant || entry.description)}</strong>
                  <div class="merchant-breakdown">${escapeHtml(entry.date)} · ${escapeHtml(
                      labelize(entry.category),
                    )}</div>
                </div>
                  <strong>${formatMoney(entry.amountJPY, data)}</strong>
                  <span>${escapeHtml(entry.notes || "Review requested.")}</span>
                </div>
              `,
            )
            .join("")
        : '<div class="table-row"><strong>No review items.</strong><span></span><span></span></div>'}
    </div>
  `;
}

function renderExcluded(data) {
  const excluded = document.getElementById("excluded");

  excluded.innerHTML = `
    <h2>Excluded movements</h2>
    <p class="panel-intro">
      Only funding moves are excluded. Physical cash withdrawals are included above as trip spend.
    </p>
    <div class="stack">
      ${data.excludedSummary
        .map(
          (entry) => `
            <div class="row">
              <div class="row-header">
                <strong>${escapeHtml(entry.label)}</strong>
                <span>${entry.count} entries · ${formatMoney(entry.totalJPY, data)}</span>
              </div>
              <div class="pill">
                ${escapeHtml("Ignored in spend totals")}
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderNextSteps(data) {
  const nextSteps = document.getElementById("next-steps");

  nextSteps.innerHTML = `
    <h2>Iterate the data</h2>
    <p class="panel-intro">
      The dashboard is designed to be refined quickly as you remember what ambiguous transactions were.
    </p>
    <div class="code-list">
      <div class="code-item">
        <strong>Add missing costs</strong>
        <p class="subtle">Flights, hotel bookings, or shared trip costs can be entered in <code>config/manual-expenses.json</code>. Current manual entries: ${data.summary.manualExpenseCount}.</p>
      </div>
      <div class="code-item">
        <strong>Adjust merchant rules</strong>
        <p class="subtle">Use <code>config/merchant-rules.json</code> for broad categorization patterns and <code>config/transaction-overrides.json</code> for one-off fixes.</p>
      </div>
      <div class="code-item">
        <strong>Rebuild the dataset</strong>
        <p class="subtle">Run <code>node scripts/build-data.mjs</code> after edits, then refresh <code>index.html</code>.</p>
      </div>
    </div>
  `;
}

function kpiCard(label, value) {
  return `
    <article class="kpi-card">
      <div class="kpi-label">${escapeHtml(label)}</div>
      <strong class="kpi-value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function currencyButton(currency, label) {
  return `
    <button
      type="button"
      class="currency-button ${state.currency === currency ? "is-active" : ""}"
      data-currency-toggle="${currency}"
      role="tab"
      aria-selected="${state.currency === currency}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function attachCurrencyToggle() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-currency-toggle]");
    if (!toggle) {
      return;
    }

    const nextCurrency = toggle.getAttribute("data-currency-toggle");
    if (!nextCurrency || nextCurrency === state.currency) {
      return;
    }

    state.currency = nextCurrency;
    renderAll(window.TRIP_DATA);
  });
}

function percent(value, max) {
  return ((value / max) * 100).toFixed(2);
}

function labelize(value) {
  return value
    .split("-")
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatMoney(valueJPY, data) {
  if (state.currency === "EUR") {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(convertJPYToEUR(valueJPY, data));
  }

  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(valueJPY);
}

function shortMoney(valueJPY, data) {
  if (state.currency === "EUR") {
    const valueEUR = convertJPYToEUR(valueJPY, data);
    if (valueEUR >= 1000) {
      return `€${(valueEUR / 1000).toFixed(valueEUR >= 10000 ? 0 : 1)}k`;
    }

    return `€${Math.round(valueEUR)}`;
  }

  if (valueJPY >= 10000) {
    return `${(valueJPY / 1000).toFixed(valueJPY >= 100000 ? 0 : 1)}k`;
  }

  return `${Math.round(valueJPY)}`;
}

function convertJPYToEUR(valueJPY, data) {
  return valueJPY * (data.fx?.rates?.EUR_PER_JPY ?? 0);
}

function formatSourceAmount(entry) {
  if (entry.sourceCurrency === "EUR") {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(entry.sourceAmount);
  }

  if (entry.sourceCurrency === "JPY") {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      maximumFractionDigits: 0,
    }).format(entry.sourceAmount);
  }

  return escapeHtml(String(entry.sourceAmount ?? ""));
}

function formatStayRange(entry) {
  if (!entry.startDate || !entry.endDate) {
    return entry.date;
  }

  return `${entry.startDate} to ${entry.endDate}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
