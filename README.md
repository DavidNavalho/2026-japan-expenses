# Japan 2026 trip costs

This repo now has a simple static dashboard that combines both bank exports into one shared-trip view, excludes internal transfers and currency conversions, and gives you a first-pass category breakdown.

## Files

- `config/merchant-rules.json`: broad merchant/category rules.
- `config/transaction-overrides.json`: specific one-off fixes for ambiguous transactions.
- `config/manual-expenses.json`: costs missing from the bank exports, such as flights or hotel bookings.
- `config/exchange-rate.json`: current JPY/EUR conversion metadata used by the dashboard toggle.
- `scripts/build-data.mjs`: turns raw CSVs + config into a browser-ready dataset.
- `data/public-data.js`: sanitized generated output used by the dashboard.
- `dist/`: generated GitHub Pages bundle.
- `.github/workflows/deploy-pages.yml`: GitHub Pages deployment workflow.
- `index.html`, `app.js`, `styles.css`: the static dashboard source.

## Workflow

1. Keep the raw CSV exports local only under `private/`. That folder is ignored by `.gitignore` and should never be committed to a public repo.
2. Edit the JSON config files.
3. Run `node scripts/build-data.mjs`.
4. Open `index.html` locally to review the dashboard.
5. Commit the updated sanitized files in `data/public-data.*` and `dist/`.
6. Push to `main` and GitHub Pages will deploy the contents of `dist/`.

## Manual expense example

Add missing costs to `config/manual-expenses.json` like this:

```json
{
  "expenses": [
    {
      "date": "2026-03-20",
      "description": "Flights to Tokyo",
      "normalizedMerchant": "TAP Air Portugal",
      "amountJPY": 185000,
      "category": "transport",
      "group": "Transport",
      "notes": "Round-trip flights booked before departure."
    }
  ]
}
```

## Notes

- Cash withdrawals are counted as `physical cash` in trip totals, but they are not broken down into finer categories.
- The currency toggle defaults to JPY and can switch to EUR using the ECB reference rate stored in `config/exchange-rate.json`.
- The public site uses a sanitized dataset. Private source exports and the full processed dataset should stay local.
- The build expects local source files at `private/account-a.csv` and `private/account-b.csv`.
- The current rules already map the known Apple Pay Suica top-up to transport.
- Several merchants are intentionally flagged for review because the bank export does not make the purchase clear enough yet.
