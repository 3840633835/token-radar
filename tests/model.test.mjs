// Token Radar 模型测试：node --test tests/
// 只测模型（lib/model.ts），不碰网络、不写文件。快照路径默认 kit 的密封快照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseSnapshot,
  buildBoard,
  buildRadar,
  boardIssue,
  gridSearch,
  walkForward,
  conformalQuantiles,
  dataScript,
} from '../lib/model.ts';

const here = dirname(fileURLToPath(import.meta.url));
const snapshotPath = process.env.SNAPSHOT ?? join(here, '..', '..', 'token-radar-01-kit', 'input', 'snapshot.json');
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));

test('snapshot parses: 758 protocols, 40 on the watchlist', () => {
  assert.equal(snapshot.protocols.length, 758);
  assert.equal(snapshot.watchlist.length, 40);
  assert.equal(snapshot.as_of, '2026-11-14');
});

test('board: 198 rows, whole watchlist covered, ranked by implied value', () => {
  const board = buildBoard(snapshot);
  assert.equal(board.length, 198);
  const slugs = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) assert.ok(slugs.has(slug), `watchlist slug missing: ${slug}`);
  for (let i = 1; i < board.length; i++) {
    assert.equal(board[i].rank, i + 1);
    assert.ok(board[i].implied_value_usd <= board[i - 1].implied_value_usd);
  }
  assert.equal(boardIssue(board, snapshot), null);
});

test('every row carries a conformal range and a nearest comparable', () => {
  const board = buildBoard(snapshot);
  for (const r of board) {
    assert.ok(r.conformal_p10_usd > 0 && r.conformal_p10_usd <= r.implied_value_usd);
    assert.ok(r.conformal_p90_usd >= r.implied_value_usd);
    assert.ok(r.kin_slug.length > 0 && r.kin_name.length > 0);
    assert.ok(r.kin_ratio > 0 && r.kin_tvl_usd > 0);
    assert.ok(r.farm_steps.length >= 3 && r.farm_steps.length <= 12);
    assert.ok(['farm', 'thin', 'skip'].includes(r.farm_verdict));
  }
});

test('grid search: 81 configs, winner beats the hand-picked radar-3 constants (1.14)', () => {
  const grid = gridSearch(snapshot);
  assert.equal(grid.configs_tried, 81);
  assert.equal(grid.top.length, 5);
  assert.ok(grid.best.loo_median_abs_log_error <= 1.1, `grid best ${grid.best.loo_median_abs_log_error}`);
  assert.ok(grid.best.loo_median_abs_log_error < 1.14);
});

test('walk-forward beats the flat median on the same split', () => {
  const wf = walkForward(snapshot);
  assert.ok(wf.test_n > 0 && wf.train_n > 0);
  assert.ok(wf.median_abs_log_error < wf.flat_median_abs_log_error);
});

test('conformal quantiles: global half-width positive, categories present', () => {
  const conf = conformalQuantiles(snapshot);
  assert.ok(conf.global_q80_log > 0);
  assert.ok(conf.categories.length > 0);
  for (const c of conf.categories) assert.ok(c.comps >= 5 && c.q80_log > 0);
});

test('buildRadar is deterministic: two runs give identical data', () => {
  const a = buildRadar(snapshot);
  const b = buildRadar(snapshot);
  assert.equal(JSON.stringify(a.radar), JSON.stringify(b.radar));
  assert.equal(JSON.stringify(a.board), JSON.stringify(b.board));
  assert.equal(a.radar.funnel[0].count, 758);
  assert.equal(a.radar.live_total + a.radar.board_size + a.radar.excluded_size, 758);
  assert.ok(dataScript(a.radar).startsWith('window.RADAR='));
});
