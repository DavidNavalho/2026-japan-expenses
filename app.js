const state = {
  currency: "JPY",
  timelineFilter: "all",
  explorerCategory: null,
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
  if (!state.explorerCategory) {
    state.explorerCategory = data.categoryTotals[0]?.category ?? null;
  }

  const availableCategories = new Set(data.categoryTotals.map((entry) => entry.category));
  if (state.explorerCategory && !availableCategories.has(state.explorerCategory)) {
    state.explorerCategory = data.categoryTotals[0]?.category ?? null;
  }

  renderSnapshot(data);
  renderCategories(data);
  renderTimeline(data);
  renderManualExpenses(data);
  renderSpendExplorer(data);
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
          This is a single shared-trip view. Net trip spend excludes fully reimbursed pass-through payments, while gross paid out includes them so the cash flow stays visible.
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
      ${kpiCard("Net trip spend", formatMoney(data.summary.netTripSpendJPY ?? data.summary.totalSpendJPY, data))}
      ${kpiCard("Gross paid out", formatMoney(data.summary.grossPaidOutJPY ?? data.summary.totalSpendJPY, data))}
      ${kpiCard("Recovered costs", formatMoney(data.summary.recoveredCostsJPY ?? 0, data))}
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
  const timelineFilters = [
    { value: "all", label: "All" },
    { value: "lodging", label: "Lodging" },
    { value: "local-transit", label: "Transportation" },
    { value: "general-shopping", label: "General Shopping" },
    { value: "flights", label: "Flights" },
  ];
  const filteredDailyTotals = buildTimelineSeries(data);
  const maxValue = Math.max(...filteredDailyTotals.map((entry) => entry.totalJPY), 1);
  const hasVisibleData = filteredDailyTotals.some((entry) => entry.totalJPY > 0);

  timeline.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Daily spend</h2>
        <p class="panel-intro">
          Totals per day across the trip. Use the filter to isolate major cost areas without exposing transaction-level details.
        </p>
      </div>
      <div class="timeline-filters" role="tablist" aria-label="Daily spend filter">
        ${timelineFilters.map((filter) => timelineFilterButton(filter)).join("")}
      </div>
    </div>
    <div class="timeline">
      ${
        hasVisibleData
          ? `
            <div class="timeline-bars">
              ${filteredDailyTotals
                .map(
                  (entry) => `
                    <div class="timeline-column" style="--bar-height: ${Math.max(percent(entry.totalJPY, maxValue), 6)}%">
                      <strong>${entry.totalJPY > 0 ? shortMoney(entry.totalJPY, data) : ""}</strong>
                      <span>${escapeHtml(entry.date.slice(5))}</span>
                    </div>
                  `,
                )
                .join("")}
            </div>
          `
          : '<p class="panel-intro">No spend matched this filter in the current trip window.</p>'
      }
    </div>
  `;
}

function renderManualExpenses(data) {
  const manualExpenses = document.getElementById("manual-expenses");
  const nonLodgingManualExpenses =
    data.manualExpenses?.filter(
      (entry) => entry.category !== "lodging" && entry.category !== "physical-cash",
    ) ?? [];

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

function renderSpendExplorer(data) {
  const spendExplorer = document.getElementById("spend-explorer");
  const activeCategory = state.explorerCategory ?? data.categoryTotals[0]?.category ?? null;
  const activeCategoryMeta = data.categoryTotals.find((entry) => entry.category === activeCategory);
  const activeEntries = (data.spendEntries ?? []).filter((entry) => entry.category === activeCategory);

  spendExplorer.innerHTML = `
    <div class="panel-header">
      <div>
        <h2>Spend Explorer</h2>
        <p class="panel-intro">
          Category totals with click-through detail. Select a category to inspect every public-safe entry in date order.
        </p>
      </div>
    </div>
    <div class="explorer-layout">
      <div class="explorer-categories">
        ${data.categoryTotals
          .map(
            (entry) => `
              <button
                type="button"
                class="explorer-category-button ${activeCategory === entry.category ? "is-active" : ""}"
                data-explorer-category="${entry.category}"
              >
                <span class="explorer-category-label">${escapeHtml(entry.label)}</span>
                <span class="explorer-category-meta">${entry.count} entries</span>
                <strong class="explorer-category-total">${formatMoney(entry.totalJPY, data)}</strong>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="explorer-detail">
        ${
          activeCategoryMeta
            ? `
              <div class="explorer-detail-header">
                <div>
                  <h3>${escapeHtml(activeCategoryMeta.label)}</h3>
                  <p class="panel-intro">
                    ${activeCategoryMeta.count} entries · ${Math.round(activeCategoryMeta.percentOfTotalSpend * 100)}% of total spend
                  </p>
                </div>
                <strong class="explorer-detail-total">${formatMoney(activeCategoryMeta.totalJPY, data)}</strong>
              </div>
              <div class="list">
                <div class="list-header explorer-entry-list">
                  <span>Date</span>
                  <span>Entry</span>
                  <span>Source</span>
                  <span>Total</span>
                </div>
                ${
                  activeEntries.length
                    ? activeEntries
                        .map(
                          (entry) => `
                            <div class="table-row explorer-entry-list">
                              <div>
                                <strong>${escapeHtml(formatExplorerDate(entry))}</strong>
                              </div>
                              <div>
                                <strong>${escapeHtml(entry.normalizedMerchant)}</strong>
                                <div class="merchant-breakdown">${escapeHtml(entry.description)}</div>
                              </div>
                              <div>${formatExplorerSource(entry)}</div>
                              <strong>${formatMoney(entry.amountJPY, data)}</strong>
                            </div>
                          `,
                        )
                        .join("")
                    : '<div class="table-row explorer-entry-list"><strong>No entries for this category.</strong><span></span><span></span><span></span></div>'
                }
              </div>
            `
            : '<p class="panel-intro">No category selected.</p>'
        }
      </div>
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
  const hiddenClassifications = new Set(["transfer", "exchange", "reimbursed-payment"]);
  const visibleExcludedEntries = (data.excludedSummary ?? []).filter(
    (entry) => !hiddenClassifications.has(entry.classification),
  );

  excluded.innerHTML = `
    <h2>Excluded movements</h2>
    <p class="panel-intro">
      This section is reserved for movements that were explicitly ignored for the trip and are still worth surfacing. Internal transfers, account savings exchanges, and reimbursed pass-through payments are intentionally kept out of this view.
    </p>
    ${
      visibleExcludedEntries.length
        ? `
          <div class="stack">
            ${visibleExcludedEntries
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
        `
        : '<p class="panel-intro">No explicitly ignored movements are currently surfaced here.</p>'
    }
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

function timelineFilterButton(filter) {
  return `
    <button
      type="button"
      class="timeline-filter-button ${state.timelineFilter === filter.value ? "is-active" : ""}"
      data-timeline-filter="${filter.value}"
      role="tab"
      aria-selected="${state.timelineFilter === filter.value}"
    >
      ${escapeHtml(filter.label)}
    </button>
  `;
}

function attachCurrencyToggle() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-currency-toggle]");
    if (toggle) {
      const nextCurrency = toggle.getAttribute("data-currency-toggle");
      if (!nextCurrency || nextCurrency === state.currency) {
        return;
      }

      state.currency = nextCurrency;
      renderAll(window.TRIP_DATA);
      return;
    }

    const timelineFilter = event.target.closest("[data-timeline-filter]");
    if (!timelineFilter) {
      return;
    }

    const nextFilter = timelineFilter.getAttribute("data-timeline-filter");
    if (!nextFilter || nextFilter === state.timelineFilter) {
      return;
    }

    state.timelineFilter = nextFilter;
    renderAll(window.TRIP_DATA);
    return;
  });

  document.addEventListener("click", (event) => {
    const explorerCategory = event.target.closest("[data-explorer-category]");
    if (!explorerCategory) {
      return;
    }

    const nextCategory = explorerCategory.getAttribute("data-explorer-category");
    if (!nextCategory || nextCategory === state.explorerCategory) {
      return;
    }

    state.explorerCategory = nextCategory;
    renderAll(window.TRIP_DATA);
  });
}

function buildTimelineSeries(data) {
  const totalsByDate = new Map(data.dailyTotals.map((entry) => [entry.date, { ...entry }]));

  if (state.timelineFilter === "all") {
    return [...totalsByDate.values()];
  }

  for (const [date, entry] of totalsByDate.entries()) {
    totalsByDate.set(date, {
      ...entry,
      totalJPY: 0,
      count: 0,
    });
  }

  for (const entry of data.dailyCategoryTotals || []) {
    if (entry.category !== state.timelineFilter) {
      continue;
    }

    totalsByDate.set(entry.date, {
      date: entry.date,
      totalJPY: entry.totalJPY,
      count: entry.count,
    });
  }

  return [...totalsByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
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

function formatExplorerDate(entry) {
  if (entry.startDate && entry.endDate && entry.startDate !== entry.endDate) {
    return `${entry.startDate} to ${entry.endDate}`;
  }

  return entry.date;
}

function formatExplorerSource(entry) {
  if (entry.sourceAmount != null && entry.sourceCurrency) {
    return `
      <strong>${formatSourceAmount(entry)}</strong>
      <div class="merchant-breakdown">${escapeHtml(sourceLabel(entry))}</div>
    `;
  }

  return `<span class="merchant-breakdown">${escapeHtml(sourceLabel(entry))}</span>`;
}

function sourceLabel(entry) {
  if (entry.source === "manual-entry") {
    return "Manual entry";
  }

  if (entry.classification === "cash-withdrawal") {
    return "Bank export";
  }

  return "Bank export";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
