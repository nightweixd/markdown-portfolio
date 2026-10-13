import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(
  new URL("../lib/screener.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const {
  normalizeDex,
  normalizeGmgn,
  matches,
  defaultFilters,
  parseFilters,
  riskLabel,
  numeric,
  deduplicate,
} = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
let checks = 0;
const check = (fn) => {
  fn();
  checks++;
};
const address = "0x" + "a".repeat(40);
const t = normalizeDex(
  {
    chainId: "bsc",
    baseToken: { address, symbol: "TEST" },
    priceUsd: "0.0001",
    marketCap: 100000,
    liquidity: { usd: 50000 },
    volume: { h1: 20000 },
    priceChange: { h1: 10 },
    txns: { h1: { buys: 20, sells: 10 } },
    pairCreatedAt: Date.now() - 3600000,
  },
  "1h",
);
check(() => assert.equal(t.honeypot, null));
check(() => assert.equal(riskLabel(t), "Incomplete"));
check(() =>
  assert.equal(matches(t, { ...defaultFilters, verifiedOnly: true }), false),
);
check(() =>
  assert.equal(
    matches(t, {
      ...defaultFilters,
      minLiquidity: 50000,
      minVolume: 20000,
      minChange: 10,
    }),
    true,
  ),
);
check(() =>
  assert.equal(
    matches({ ...t, liquidity: null }, { ...defaultFilters, minLiquidity: 1 }),
    false,
  ),
);
check(() =>
  assert.equal(
    matches({ ...t, top10: null }, { ...defaultFilters, maxTop10: 30 }),
    false,
  ),
);
check(() =>
  assert.equal(
    matches(
      { ...t, marketCap: null },
      { ...defaultFilters, maxMarketCap: 500000 },
    ),
    false,
  ),
);
check(() =>
  assert.equal(
    matches({ ...t, createdAt: null }, { ...defaultFilters, maxAgeHours: 24 }),
    false,
  ),
);
check(() =>
  assert.equal(matches({ ...t, honeypot: true }, defaultFilters), false),
);
check(() =>
  assert.equal(matches({ ...t, washTrading: true }, defaultFilters), false),
);
check(() => assert.equal(matches({ ...t, rug: 0.31 }, defaultFilters), false));
check(() =>
  assert.equal(
    normalizeDex({ chainId: "solana", baseToken: { address } }, "1h"),
    null,
  ),
);
check(() =>
  assert.equal(
    normalizeDex({ chainId: "bsc", baseToken: { address: "bad" } }, "1h"),
    null,
  ),
);
check(() => assert.equal(numeric(""), null));
check(() => assert.equal(numeric(false), null));
check(() => assert.equal(numeric("NaN"), null));
check(() =>
  assert.equal(
    deduplicate([t, { ...t, liquidity: 99999 }])[0].liquidity,
    99999,
  ),
);
check(() =>
  assert.throws(() => parseFilters({ ...defaultFilters, maxTop10: 101 })),
);
check(() =>
  assert.throws(() => parseFilters({ ...defaultFilters, minLiquidity: -1 })),
);
check(() =>
  assert.throws(() =>
    parseFilters({ ...defaultFilters, minMarketCap: 100, maxMarketCap: 50 }),
  ),
);
const g = normalizeGmgn(
  {
    address,
    is_honeypot: "no",
    open_source: "yes",
    usd_market_cap: "123",
    created_timestamp: 123,
    volume_1h: 12,
    volume_24h: 144,
  },
  "1h",
  true,
);
check(() => assert.equal(g.honeypot, false));
check(() => assert.equal(g.verified, true));
check(() => assert.equal(g.marketCap, 123));
check(() => assert.equal(g.volume, 12));
check(() => assert.equal(g.change, null));
console.log(
  `${checks} screener checks passed: missing data, risk gates, BSC addresses, provider mapping and filters.`,
);
