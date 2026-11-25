# METHODOLOGY — Token Radar (radar-4)

How the board is built, what was tested, and where it fails. Every number
below is recomputed from the sealed snapshot on every run; nothing is
hardcoded from an earlier run.

## The snapshot

- Source: the sealed DefiLlama protocol index, `snapshot.json`, 758 protocols
  as of 2026-11-14. Floor: $50,000,000 TVL. Watchlist: 40 protocols.
- A protocol "records no token" when all three of `mcap_usd`, `gecko_id`
  and `symbol` are null. That is a statement about the record, never proof
  the protocol has no token.

## Who is ranked (the funnel)

| Step | Count |
| --- | --- |
| Protocols in the snapshot | 758 |
| Pre-token (no token recorded) | 342 |
| Rankable after the house screen | 198 |
| Watchlist, all on the board | 40 |
| Live-token, set aside | 416 |

The house's own watchlist screen is applied to the whole board, not just
the watchlist: Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
Restaked BTC and CEX categories, wrapped/staked names, versioned pools
(`V2`, `v3`, …) and exchange-named products are set aside, not ranked.
They are derivatives of tokens that already trade, not launch candidates.
The 144 pre-token protocols set aside this way are listed in the dashboard
audit panel with the reason for each. 198 + 416 + 144 = 758: every protocol
is accounted for.

## The value model

```
implied  = exp(intercept + slope x ln(TVL)) x growth x maturity
expected = implied x launch_odds
```

- **Curve.** `log(mcap) = intercept + slope x log(TVL)`, least squares on
  the 119 live-token comparables (positive market cap and TVL, not an
  exchange). On this snapshot: `log(mcap) = 7.7881 + 0.4721 x log(TVL)`,
  R² 0.143. Bigger protocols trade at lower multiples, so the curve values
  size sub-linearly. A log-log quadratic and a flat median multiple were
  tested and lost (see Validation).
- **Growth.** Seven-day TVL change, clamped to −80%…+120%. A rise counts
  less than a fall: the weight up/down and the maturity floor and half-life
  are **grid-searched**, not picked (see below).
- **Maturity.** `floor + (1 − floor) x (1 − exp(−age / half_life))`, where
  age is days since first listing. Older with no token scores closer to 1.
  Unknown listing date uses 365 days.
- **Chain breadth** was tested as a pricing multiplier and rejected
  (ablation: it makes leave-one-out worse). It is shown per row, not priced.

## Grid search (the constants were fitted, not picked)

81 combinations — growth-up {0.3, 0.5, 0.7} × growth-down {0.6, 0.8, 1.0}
× maturity floor {0.5, 0.65, 0.8} × half-life {365, 730, 1460} days —
each scored by leave-one-out over all 119 comparables (curve refitted every
fold). Winner on this snapshot: up 0.3 / down 0.6 / floor 0.5 /
half-life 1460 days, median log error 1.04, against 1.14 for the hand-picked
radar-3 constants. The growth-up weight is weakly identified: the top three
configs score the same 1.04 with up-weights 0.3, 0.5 and 0.7; the grid takes
the first in grid order and the dashboard says so.

## Validation (all computed in-model, shown in the dashboard)

- **Curve form, leave-one-out:** log-log line 1.212, quadratic 1.248,
  flat median multiple 1.597. **Random-half split** (seeded, fit half /
  test half): same order.
- **Ablation (leave-one-out):** curve alone 1.212; + growth 1.231;
  + growth + maturity **1.04 (best)**; + breadth 1.077; category median
  alone 1.602; category median with all multipliers 1.645.
- **Walk-forward:** comparables ordered by listing date — 43 listed before
  2024-02-28 fit the curve, 44 listed after test it. Full model 1.05,
  flat median 1.602 on the same split. The model holds up out of time
  about as well as in leave-one-out — but only ~21% of predictions land
  within a factor of two, so the range on each row matters more than the
  point estimate.
- **Launch odds:** cohort token rate by age bucket × category, shrunk toward
  the bucket rate (prior 5). Leave-one-out Brier 0.216 vs base rate 0.250,
  log loss 0.625 vs 0.693. On a listing-date split they do **not** beat the
  base rate (Brier 0.265 vs 0.221): odds are a cohort description, not a
  forecast. The dashboard states this.
- **Per-category leave-one-out:** RWA is priced best, Yield worst (see the
  dashboard table).
- **Uncertainty, two kinds:** (1) bootstrap — the curve refitted 200 times
  on seeded resamples gives each row a p10–p90 implied-value and rank
  range (parameter uncertainty). (2) conformal — the 80th percentile of the
  absolute leave-one-out log errors, per category (≥5 comparables) else
  global (2.77 log, about ×16), gives each row an 80% range (prediction
  uncertainty). The conformal range is wide on purpose: the market is noisy
  and a point estimate without a wide range would be dishonest.

## Nearest comparable (kin)

Each row names the live-token protocol whose TVL is closest in log terms,
with its market cap, TVL and market-cap/TVL ratio — the single most
informative anchor for "what would this be worth if it traded today".

## Farm plans

8 steps per protocol, derived from its category, chains, TVL and age:
fresh wallet; the category's main action with capital by TVL
($50 / $100 / $150 / $250); a second, different qualifying action; the
category's main risk, stated first; one action a week; hold 30–60 days by
age; claim only from the protocol's own published link; decide on vesting
before selling. Gas is priced by main chain (Ethereum ~$12, Solana ~$0.05,
major L2s ~$1, others ~$0.50). Cost is netted (capital + gas) and shown
with total hours and cost per hour. Verdict — farm / thin / skip — is
judged at the bootstrap P10: skip when gas alone exceeds the capital or
the P10 launch is under $1M implied; thin when gas is over half the
capital or the P10 launch is under $10M; farm otherwise. The farm
portfolio planner picks greedily by expected value per farm dollar under a
capital budget and weekly hours.

## Limits — read before acting on a number

- The curve explains little of the variation (R² 0.143 on 119 comparables):
  most of what makes a token valuable is not in this snapshot.
- The snapshot is one date, so launch odds describe a cohort, not the future.
- The curve extrapolates beyond the comparables' TVL range for the biggest
  rows, where no live token of that size exists to anchor it.
- A farm verdict is a screening ratio at the P10 of the range, never a
  promised return, and "records no token" is not proof of no token.
- The board is deterministic: no randomness beyond the seeded bootstrap,
  no timestamps, no network. Two runs on the same snapshot write identical
  bytes (verified).

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22.18 or later, standard library only. Tests: `node --test tests/model.test.mjs`.
