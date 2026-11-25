// Token Radar dashboard (radar-4). Reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, filters, a per-protocol detail view
// with the model's own arithmetic, and the live-token set kept apart.
// No network: every byte shown is in data.js. No protocol name is special-cased:
// the farm plan and the implied value are the same derivations main.ts writes
// to board.json, recomputed here from the snapshot figures.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function, mirroring lib/model.ts impliedOf exactly:
  // the fitted log-log curve value, times the growth and maturity multipliers.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var weight = growth >= 0 ? model.growth_weight_up : model.growth_weight_down;
    var growthMult = 1 + (growth / 100) * weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + model.maturity_range * (1 - Math.exp(-age / model.maturity_halflife_days));
    return Math.max(1, Math.round(row.curve_value_usd * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // Farm plan: the same derivation main.ts writes to board.json (category,
  // chains, TVL and age decide the action, the capital, the hold and every
  // cost and time). No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  // Gas by main chain, in dollars per transaction (the same table main.ts uses).
  function gasUsd(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return 12;
    if (c === 'bitcoin') return 2;
    if (c === 'solana') return 0.05;
    if (['arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'scroll', 'linea', 'blast', 'mantle', 'mode', 'ink', 'unichain', 'katana', 'world chain'].indexOf(c) >= 0) return 1;
    return 0.5;
  }
  function farmEconomics(p) {
    var capital = capitalFor(p);
    var gas = gasUsd(chainOf(p));
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.ceil(hold / 7);
    var gasTotal = Math.round((2 * gas + weeks * gas + gas) * 100) / 100;
    return { capital: capital, gas: gasTotal, total: Math.round((capital + gasTotal) * 100) / 100, hours: Math.round((0.5 + weeks * (10 / 60) + 0.25) * 10) / 10, hold: hold };
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Use $' + capital + ' on ' + name + "'s chain on " + chain + ': send one transaction a week and keep the wallet active.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function secondActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount against the ' + name + ' deposit on ' + chain + ' and repay it within the week.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0) return 'Swap a small amount through ' + name + ' on ' + chain + ' so the wallet shows both providing and trading.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a smaller amount back through ' + name + ' so the wallet shows two-way use.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('rwa') >= 0) return 'Claim or restake the vault yield on ' + name + ' once, instead of letting it sit untouched.';
    return 'Vote or join one community action on ' + name + ' on ' + chain + ' so the wallet shows more than deposits.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function riskFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Check the impermanent loss on ' + name + "'s pool first: if the pair moves apart, the loss can exceed a week of yield, so size the position to survive it.";
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Check the health factor on ' + name + ' before you borrow: keep it above 2 so a price dip cannot liquidate the deposit.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Check the funding rate on ' + name + ' first: a high rate eats the position every eight hours, so close it if the rate stays against you.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Check the unbonding wait on ' + name + ' before you stake: the funds cannot move until the wait ends, so never stake money you need this month.';
    if (c.indexOf('stable') >= 0) return "Check the peg and the backing of " + name + "'s stable asset first: if it trades below $1, do not mint more until the peg holds.";
    if (c.indexOf('rwa') >= 0) return "Check what backs " + name + "'s yield asset and who can redeem it: if the backing is not verifiable, treat the yield as a claim, not a fact.";
    if (c.indexOf('bridge') >= 0) return "Check the bridge's own security record on " + name + ' first: a bridge that has been drained before is a reason to keep the position small.';
    if (c.indexOf('insurance') >= 0) return 'Read what ' + name + "'s cover actually pays for before you buy: a policy that excludes the risk you fear is money spent on nothing.";
    return 'Read ' + name + "'s own docs for the one risk its category is known for, and size the position so that risk cannot take the whole deposit.";
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var gas = gasUsd(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm on ' + p.name + ', and keep its seed phrase offline on paper.', cost: 'under $' + Math.max(3, gas) + ' of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas on ' + chain, time: '15 minutes to set up' },
      { text: secondActionFor(p, capital, chain), cost: 'about $' + gas + ' of gas', time: '10 minutes' },
      { text: riskFor(p), cost: 'nothing to check', time: '10 minutes' },
      { text: 'Make one qualifying action each week on ' + p.name + ', such as a deposit, a borrow, a swap or a vote.', cost: 'about $' + gas + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw from " + p.name + ", open its own points or rewards page and claim only from the link it publishes; never pay to claim and never follow a claim link from a direct message.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'If ' + p.name + ' issues a token, check its vesting and claim window first, then decide to hold or sell on the protocol\u2019s TVL and revenue, not on the launch-day price.', cost: 'one claim transaction, about $' + gas + ' of gas', time: '15 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, so the board holds all ' + DATA.board_size + ' rankable pre-token protocols in the snapshot. Implied value is a model, not a promise: it says what a launch would be worth if the protocol\u2019s record stayed as it is.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token set aside, audited' }), el('b', { text: String(DATA.excluded_size) }))
      )
    );
  }

  function integrity() {
    return el('div', { class: 'strip' },
      el('span', null, 'Snapshot ', el('b', { text: DATA.as_of }), ' from ', el('b', { text: DATA.source })),
      el('span', null, el('b', { text: String(DATA.funnel[0].count) }), ' protocols, all accounted for'),
      el('span', null, 'Deterministic: ', el('b', { text: 'two runs, byte-identical' })),
      el('span', null, 'Offline: ', el('b', { text: 'no network requests' })),
      el('span', null, 'Model ', el('b', { text: DATA.model_version }))
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 3);
    var cards = top.map(function (r) {
      return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
        el('span', { class: 'rank', text: 'Rank ' + r.rank }),
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 TVL ' + fmtUsd(r.tvl_usd) }),
        el('span', { class: 'num', text: 'Implied ' + fmtUsd(r.implied_value_usd) })
      );
    });
    return el('div', { class: 'spot' }, cards);
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), el('span', { class: 'badge watch', text: r.watchlist ? 'watchlist' : 'early' }), el('span', { class: 'badge ' + r.farm_verdict, text: r.farm_verdict })),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        ), el('div', { class: 'sub', text: 'expected ' + fmtUsd(r.expected_value_usd) + ' at ' + Math.round(r.launch_odds * 100) + '% odds' })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market-cap-to-TVL ratios are the comparables the model prices the pre-token board with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var c = DATA.curve;
    var v = DATA.validation;
    function errTable(rows, cols) {
      return el('table', { class: 'cat-table' },
        el('thead', null, el('tr', null, cols.map(function (h) { return el('th', { scope: 'col', text: h }); }))),
        el('tbody', null, rows.map(function (r) {
          return el('tr', null, r.map(function (cell, i) { return el('td', { class: i > 0 ? 'num' : '', text: String(cell) }); }));
        }))
      );
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one fitted function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The curve is fitted on the ' + c.comps + ' live-token protocols in this snapshot (least squares on log market cap against log TVL): log(mcap) = ' + c.intercept + ' + ' + c.slope + ' x log(TVL), R² ' + c.r_squared + '. Bigger protocols trade at lower multiples, so the curve values size sub-linearly. Growth and maturity are multipliers on the curve value, and chain breadth was tested as a multiplier and rejected (see ablation).' }),
      el('div', { class: 'formula' },
        'implied = round( exp(' + c.intercept + ' + ' + c.slope + ' x ln(tvl_usd)) x growth x maturity )\n' +
        'growth = 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight_up + ' up / ' + m.growth_weight_down + ' down\n' +
        'maturity = ' + m.maturity_floor + ' + ' + m.maturity_range + ' x (1 - exp(-age_days / ' + m.maturity_halflife_days + '))\n' +
        'expected = implied x launch_odds (cohort rate by age bucket and category, shrunk toward the bucket rate)'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. A protocol records no token, which is not proof it has none. The board applies the house watchlist screen to every row: bridges, liquid-staking and restaking derivatives, exchanges, versioned pools and exchange-named products are set aside, not ranked — their tokens already trade.' }),
      el('h3', { text: 'Validation: the curve form, picked blind' }),
      el('p', { class: 'sub', text: 'Three curve forms were scored by leave-one-out over all ' + c.comps + ' comparables and by a seeded random-half split (fit half, test the other half). The log-log line wins both; the quadratic does not beat it, and the flat median multiple is far worse. Error is the median absolute log error (x' + Math.exp(v.loo[0].median_abs_log_error).toFixed(1) + ' at ' + v.loo[0].median_abs_log_error + '); within 2x is the share predicted within a factor of two.' }),
      errTable(v.loo.map(function (r) { return [r.form, r.median_abs_log_error, r.within_2x]; }), ['Curve form (leave-one-out)', 'Median log error', 'Within 2x']),
      errTable(v.split.map(function (r) { return [r.form, r.median_abs_log_error, r.within_2x]; }), ['Curve form (random-half split)', 'Median log error', 'Within 2x']),
      el('h3', { text: 'Ablation: every extra term had to earn its keep' }),
      el('p', { class: 'sub', text: 'Each config was scored by the same leave-one-out test, with the grid-searched constants below. Growth plus maturity is the best combination; adding chain breadth makes it worse, so breadth is not a pricing term. The category-median model (radar-2) is the worst of the six — that is why radar-3 replaced it, and radar-4 keeps the curve.' }),
      errTable(v.ablation.map(function (r) { return [r.config, r.median_abs_log_error, r.within_2x]; }), ['Config', 'Median log error', 'Within 2x']),
      el('h3', { text: 'Grid search: the constants were fitted, not picked' }),
      el('p', { class: 'sub', text: v.grid_search.configs_tried + ' combinations of growth weights, maturity floor and maturity half-life were each scored by leave-one-out over all ' + c.comps + ' comparables. The winner (growth up x' + v.grid_search.best.growth_weight_up + ' / down x' + v.grid_search.best.growth_weight_down + ', maturity floor ' + v.grid_search.best.maturity_floor + ', half-life ' + v.grid_search.best.maturity_halflife_days + ' days) scores ' + v.grid_search.best.loo_median_abs_log_error + ', against 1.14 for the hand-picked radar-3 constants. The growth-up weight is weakly identified: the top three configs score the same 1.04 with up-weights 0.3, 0.5 and 0.7, so the grid takes the first and says so.' }),
      errTable(v.grid_search.top.map(function (r) { return ['up x' + r.growth_weight_up + ' / down x' + r.growth_weight_down + ' / floor ' + r.maturity_floor + ' / ' + r.maturity_halflife_days + 'd', r.loo_median_abs_log_error]; }), ['Top configs', 'Median log error']),
      el('h3', { text: 'Walk-forward: does it hold up over time?' }),
      el('p', { class: 'sub', text: 'Comparables were ordered by listing date; the curve was fitted on the ' + v.walk_forward.train_n + ' listed before ' + v.walk_forward.train_before + ' and tested on the ' + v.walk_forward.test_n + ' listed after. The full model scores ' + v.walk_forward.median_abs_log_error + ' out of time (x' + Math.exp(v.walk_forward.median_abs_log_error).toFixed(1) + '), against ' + v.walk_forward.flat_median_abs_log_error + ' for the flat median multiple on the same split — the model holds up out of time about as well as it does in leave-one-out (' + v.grid_search.best.loo_median_abs_log_error + '). Only ' + Math.round(v.walk_forward.within_2x * 100) + '% land within a factor of two, so the range on each row matters more than the point estimate.' }),
      errTable([['Full model (curve x growth x maturity)', v.walk_forward.median_abs_log_error, v.walk_forward.within_2x], ['Flat median multiple', v.walk_forward.flat_median_abs_log_error, '—']], ['Walk-forward (' + v.walk_forward.train_n + ' train / ' + v.walk_forward.test_n + ' test)', 'Median log error', 'Within 2x']),
      el('h3', { text: 'Range honesty: conformal intervals from real errors' }),
      el('p', { class: 'sub', text: 'The p10–p90 range on each row is parameter uncertainty (200 bootstrap refits of the curve). The conformal 80% range is prediction uncertainty: the 80th percentile of the absolute leave-one-out log errors, per category where at least 5 comparables exist, otherwise the global value (' + v.conformal.global_q80_log + ' in log terms, about x' + Math.exp(v.conformal.global_q80_log).toFixed(0) + '). It is wide on purpose — the market is noisy (R² ' + c.r_squared + '), and a point estimate without a wide range would be dishonest. Farm verdicts are judged at the bootstrap P10, the stricter of the two for small rows.' }),
      errTable(v.conformal.categories.map(function (r) { return [r.category, r.comps, r.q80_log]; }), ['Category', 'Comparables', 'Conformal 80% half-width (log)']),
      el('h3', { text: 'Where the implied value sits, by category' }),
      el('p', { class: 'sub', text: 'Combined implied value of the ranked rows in each category. Risk Curators hold the most, which is why the board is dominated by vaults and curators rather than by one chain or one name.' }),
      errTable(DATA.category_totals.slice(0, 10).map(function (r) { return [r.category, r.rows, fmtUsd(r.combined_implied_usd)]; }), ['Category', 'Rows', 'Combined implied value']),
      el('h3', { text: 'Limits — read this before acting on a number' }),
      el('p', { class: 'sub', text: 'The curve explains little of the variation (R² ' + c.r_squared + ' on ' + c.comps + ' comparables): most of what makes a token valuable is not in this snapshot. The snapshot is one date, so launch odds are a cohort description, not a forecast — on a listing-date split they do not beat the base rate. The curve extrapolates beyond the comparables\u2019 TVL range for the biggest rows, where no live token of that size exists to anchor it. A farm verdict is a screening ratio at the P10 of the range, never a promised return, and a protocol that records no token is not proven to have none.' }),
      el('h3', { text: 'Launch odds, validated — and where they fail' }),
      el('p', { class: 'sub', text: 'Odds are the share of protocols like this one that already have a token, by age bucket and category. Out of sample by leave-one-out they beat the base rate (Brier ' + v.odds.loo_brier + ' against ' + v.odds.base_brier + ', log loss ' + v.odds.loo_log_loss + ' against ' + v.odds.base_log_loss + '). On a listing-date split — fit on the older half, test on the newer half — they do NOT beat the base rate (Brier ' + v.odds.time_split_brier + ' against ' + v.odds.time_split_base_brier + '), so treat odds as a cohort description, not a forecast: the snapshot is one date, and launch rates move over time.' }),
      errTable(DATA.odds_buckets.map(function (b) { return [b.label, b.cohort, b.token_rate]; }), ['Age bucket', 'Protocols', 'Token rate']),
      el('h3', { text: 'Where the curve is worst, by category' }),
      el('p', { class: 'sub', text: 'Leave-one-out error by category (categories with at least 5 comparables). RWA is priced best, Yield worst — the curve is a blunt instrument, and the p10–p90 range on each row says so.' }),
      errTable(v.per_category_loo.map(function (r) { return [r.category, r.comps, r.median_abs_log_error]; }), ['Category', 'Comparables', 'Median log error'])
    );
  }

  function plannerPanel() {
    var budgetInput = el('input', { type: 'number', id: 'budget', value: '1000', min: '50', step: '50', 'aria-label': 'Capital budget in dollars' });
    var hoursInput = el('input', { type: 'number', id: 'hours', value: '5', min: '1', step: '1', 'aria-label': 'Hours available per week' });
    var out = el('div', { class: 'planner-out' });
    function plan() {
      var budget = Math.max(0, Number(budgetInput.value) || 0);
      var hours = Math.max(0, Number(hoursInput.value) || 0);
      var picks = [];
      var spent = 0;
      var time = 0;
      var expected = 0;
      var p10 = 0;
      var cands = DATA.rows.filter(function (r) { return r.farm_verdict !== 'skip'; })
        .slice().sort(function (a, b) { return (b.expected_value_usd / b.farm_cost_usd) - (a.expected_value_usd / a.farm_cost_usd) || a.rank - b.rank; });
      cands.forEach(function (r) {
        var weekly = r.farm_hours / 4;
        if (spent + r.farm_cost_usd > budget) return;
        if (time + weekly > hours) return;
        picks.push(r);
        spent += r.farm_cost_usd;
        time += weekly;
        expected += r.expected_value_usd;
        p10 += r.implied_p10_usd * r.launch_odds;
      });
      out.textContent = '';
      out.appendChild(el('p', { class: 'sub', text: picks.length + ' farms picked for $' + Math.round(spent) + ' of a $' + budget + ' budget and ' + time.toFixed(1) + ' of ' + hours + ' hours a week. Total expected value ' + fmtUsd(Math.round(expected)) + '; P10 expected value ' + fmtUsd(Math.round(p10)) + '. The pick is greedy by expected value per farm dollar, so the same budget always gives the same plan. Skipped rows are the ones the P10 verdict marks skip.' }));
      if (picks.length) {
        out.appendChild(el('table', { class: 'cat-table' },
          el('thead', null, el('tr', null, ['Rank', 'Protocol', 'Cost', 'Hours / week', 'Cost / hour', 'Expected'].map(function (h) { return el('th', { scope: 'col', text: h }); }))),
          el('tbody', null, picks.map(function (r) {
            return el('tr', null, [r.rank, r.name, '$' + Math.round(r.farm_cost_usd), (r.farm_hours / 4).toFixed(1), '$' + (r.farm_cost_usd / r.farm_hours).toFixed(2), fmtUsd(r.expected_value_usd)].map(function (cell, i) { return el('td', { class: i > 1 ? 'num' : '', text: String(cell) }); }));
          }))
        ));
      }
    }
    budgetInput.addEventListener('input', plan);
    hoursInput.addEventListener('input', plan);
    setTimeout(plan, 0);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Farm portfolio planner' }),
      el('p', { class: 'sub', text: 'Give a capital budget and the hours a week you can spend, and the planner picks the farms that maximise expected value per farm dollar. It never picks a row the P10 verdict marks skip. Expected value is implied value times launch odds — a screening ratio, never a promised return.' }),
      el('div', { class: 'controls' },
        el('div', { class: 'field' }, el('label', { for: 'budget', text: 'Capital budget ($)' }), budgetInput),
        el('div', { class: 'field' }, el('label', { for: 'hours', text: 'Hours per week' }), hoursInput)
      ),
      out
    );
  }

  function auditPanel() {
    var counts = el('p', { class: 'sub', text: 'The snapshot holds ' + DATA.funnel[0].count + ' protocols. This board accounts for all of them: ' + DATA.board_size + ' ranked + ' + DATA.live_total + ' live-token protocols (the top ' + DATA.live_size + ' shown in the live view) + ' + DATA.excluded_size + ' pre-token protocols set aside below. Every set-aside protocol is listed with its reason, so nothing is silently dropped.' });
    var funnel = el('table', { class: 'cat-table' },
      el('thead', null, el('tr', null, ['Step', 'Protocols'].map(function (h) { return el('th', { scope: 'col', text: h }); }))),
      el('tbody', null, DATA.funnel.map(function (r) {
        return el('tr', null, [r.step, String(r.count)].map(function (cell, i) { return el('td', { class: i === 1 ? 'num' : '', text: cell }); }));
      }))
    );
    var list = el('details', null,
      el('summary', { text: 'Show all ' + DATA.excluded.length + ' set-aside protocols' }),
      el('table', { class: 'cat-table' },
        el('thead', null, el('tr', null, ['Protocol', 'Category', 'TVL', 'Reason'].map(function (h) { return el('th', { scope: 'col', text: h }); }))),
        el('tbody', null, DATA.excluded.map(function (r) {
          return el('tr', null, [r.name, r.category || 'Other', fmtUsd(r.tvl_usd), r.reason].map(function (cell, i) { return el('td', { class: i === 2 ? 'num' : '', text: String(cell) }); }));
        }))
      )
    );
    return el('section', { class: 'panel model' },
      el('h2', { text: 'Audit: every protocol accounted for' }),
      counts,
      funnel,
      list
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 watchlist' : ' \u00b7 early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + (row.listed_at ? ' \u00b7 listed ' + row.listed_at : '') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('p', { class: 'formula', text: 'implied = exp(' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x ln(' + fmtUsd(row.tvl_usd) + ')) x ' + row.growth_multiplier + ' x ' + row.maturity_multiplier + ' = ' + fmtUsd(row.implied_value_usd) }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Fitted curve value (log(mcap) = ' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x log(TVL))' }), el('b', { class: 'num', text: fmtUsd(row.curve_value_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Implied range (p10–p90, 200 bootstrap refits)' }), el('b', { class: 'num', text: fmtUsd(row.implied_p10_usd) + ' – ' + fmtUsd(row.implied_p90_usd) })),
        el('div', null, el('span', { text: 'Conformal 80% range (from leave-one-out errors)' }), el('b', { class: 'num', text: fmtUsd(row.conformal_p10_usd) + ' – ' + fmtUsd(row.conformal_p90_usd) })),
        el('div', null, el('span', { text: 'Rank range (p10–p90)' }), el('b', { class: 'num', text: '#' + row.rank_p10 + ' – #' + row.rank_p90 })),
        el('div', null, el('span', { text: 'Nearest live comparable' }), el('b', { class: 'num', text: row.kin_name + ' (' + fmtUsd(row.kin_mcap_usd) + ' on ' + fmtUsd(row.kin_tvl_usd) + ' TVL, ratio ' + row.kin_ratio + ')' })),
        el('div', null, el('span', { text: 'Launch odds (cohort rate)' }), el('b', { class: 'num', text: Math.round(row.launch_odds * 100) + '%' })),
        el('div', null, el('span', { text: 'Expected value (implied x odds)' }), el('b', { class: 'num', text: fmtUsd(row.expected_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The conformal range is wide because the model\u2019s own out-of-sample errors are wide (R² ' + DATA.curve.r_squared + ') — the point estimate is the middle of a broad distribution, not a price. This is an estimate, not a price, and the protocol records no token, which is not proof it has none.' })
    ));
    var econ = farmEconomics(row);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict: ' + row.farm_verdict }),
      el('p', { class: 'sub', text: 'Netted cost $' + Math.round(row.farm_cost_usd) + ' (capital $' + Math.round(econ.capital) + ' + gas $' + econ.gas + '), about ' + row.farm_hours + ' hours over the hold — $' + (row.farm_cost_usd / row.farm_hours).toFixed(2) + ' per hour of work. Expected value per farm dollar ' + fmtUsd(Math.round(row.expected_value_usd / row.farm_cost_usd)) + '; P10 expected value per dollar ' + fmtUsd(Math.round((row.implied_p10_usd * row.launch_odds) / row.farm_cost_usd)) + '. Verdict is judged at the P10 of the value range: skip when gas alone exceeds the capital or the P10 launch is under $1M implied, thin when gas is over half the capital or the P10 launch is under $10M, farm otherwise. These are screening ratios, never promised returns.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(integrity());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(plannerPanel());
    if (state.tab === 'pre-token') shell.appendChild(auditPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ' from the DefiLlama protocol index. A board row says a protocol records no token, never that it has none. Implied values are this entry\u2019s own model, not a price and not a prediction that a token will be issued.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
