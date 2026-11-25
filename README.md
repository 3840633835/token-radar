# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/3840633835/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/3840633835/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 198 pre-token protocols ranked by implied value — what a token would be worth if the protocol traded at the value a fitted curve on the live-token market implies — with a concrete eight-step farm plan for each row, a farm verdict, launch odds, and a portfolio planner. It reads a sealed DefiLlama snapshot and hands in a static dashboard: a sortable, filterable board, a detail view for each protocol, a validation panel, and an audit of every protocol the board does not rank.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22.18 or later, standard library only. Deterministic: run it twice on the same snapshot and every output byte is identical. It writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` (last) to the output directory.

## What it is

- **Board:** 198 rows — the full 40-protocol watchlist (TVL ≥ $50M, no token) plus 158 pre-token protocols below the floor that pass the house's own watchlist screen. No top-N cut: the radar ranks the whole set it finds.
- **Model (radar-4):** `implied = exp(intercept + slope x ln(TVL)) x growth x maturity`
  - The curve is **fitted, not chosen**: `log(mcap) = 7.7881 + 0.4721 x log(TVL)` (R² 0.14, 119 live-token comparables in this snapshot). Bigger protocols trade at lower multiples, so the curve values size sub-linearly.
  - `growth` and `maturity` are **grid-searched, not picked**: 81 combinations of growth weights, maturity floor and half-life were each scored by leave-one-out over all 119 comparables. The winner (rise x0.3, fall x0.6, floor 0.5, half-life 1460 days) scores 1.04, against 1.14 for the hand-picked radar-3 constants — and the dashboard says the growth-up weight is weakly identified (the top three configs tie at 1.04).
  - `expected = implied x launch_odds`, where launch odds are the empirical cohort rate by age bucket and category (26% for protocols under 180 days old, 82% past 1100 days), shrunk toward the bucket rate.
  - No protocol name is special-cased; the same function scores every row.
  - Each row also names its **nearest live comparable** (kin): the live-token protocol closest in TVL, with its market cap and multiple — and the detail view shows the row's value as a one-line equation.
- **Validation, printed in the dashboard and in `board.json`:** the log-log line wins the curve-form test (leave-one-out median log error 1.21, against 1.25 for a quadratic and 1.60 for a flat median multiple; the same order on a seeded random-half split). A six-config ablation puts curve + growth + maturity first (1.04 with the grid-searched constants); adding chain breadth makes it worse, so breadth is not a pricing term, and the category-median model of radar-2 is last (1.64) — that is why radar-3 replaced it. **Walk-forward:** fitting the curve on the 43 comparables listed before 2024-02-28 and testing on the 44 listed after gives 1.05, against 1.60 for the flat median on the same split — the model holds up out of time. Launch odds beat the base rate out of sample by leave-one-out (Brier 0.216 against 0.250) but **not** on a listing-date split (0.265 against 0.221), so the dashboard says so: odds are a cohort description, not a forecast.
- **Uncertainty, two kinds:** the curve is refit 200 times on seeded bootstrap resamples; every row carries its p10–p90 implied-value range and rank range (parameter uncertainty). Separately, the 80th percentile of the absolute leave-one-out log errors — per category, else global (2.77 log, about x16) — gives each row a **conformal 80% range** (prediction uncertainty). It is wide on purpose: the market is noisy, and a point estimate without a wide range would be dishonest.
- **Farm plans:** eight steps per protocol, derived from its category, chains, TVL and age — capital by TVL ($50 / $100 / $150 / $250), gas priced by the main chain (Ethereum ~$12, Solana ~$0.05, major L2s ~$1), a category-specific risk step, a second qualifying action, a weekly action, a hold by age, a claim-safety step, and what to do after a launch. Costs are netted to the dollar and shown with total hours and **cost per hour**; every row gets a **farm / thin / skip** verdict judged at the P10 of its value range. The dashboard's portfolio planner turns the board into a farm plan for a capital budget and the hours a week available.
- **Methodology:** `METHODOLOGY.md` explains the funnel, the model, the grid search, every validation test and the limits, in full. Tests: `node --test tests/model.test.mjs` (7 tests, all passing).
- **Audit:** the snapshot holds 758 protocols and the board accounts for all of them — 198 ranked + 416 that already trade + 144 pre-token protocols set aside, each listed with its reason. The set-aside rule is the house's own watchlist screen applied to the whole board: bridges, liquid-staking and restaking derivatives, exchanges, versioned pools and exchange-named products are not launch candidates, because their tokens already trade.
- **Dashboard:** a static page (`dashboard/`) that renders the whole board with no network — board view, per-protocol detail view, filtered views (search, category, chain, watchlist-only), a live-token view, the model's formula and validation, a portfolio planner, and the audit. The page recomputes each row's implied value in the browser and confirms it matches `board.json`.

## Check it

```sh
node <kit>/cli/makefun.mjs check --repo . --bundle transcripts.tar.gz
```

## Files

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes the outputs.
- `lib/model.ts` — the radar-4 model: snapshot parsing, the fitted curve, grid search, walk-forward and conformal validation, launch odds, bootstrap ranges, farm plans, the board builder and the gate check.
- `METHODOLOGY.md` — the full method: funnel, model, grid search, validation, limits.
- `tests/model.test.mjs` — model tests (`node --test tests/model.test.mjs`).
- `vendor/makefun-board.ts` — the kit's dossier builder (unchanged from the kit).
- `dashboard/` — the static page (index.html, app.css and app.js).
- `screenshots/` — board, detail and filtered views of the dashboard.

## License

MIT — see `LICENSE`.

---

Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards
