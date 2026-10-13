import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const uri = (source) =>
  "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const core = uri(compile(fs.readFileSync("lib/screener.ts", "utf8")));
const demo = uri(compile(fs.readFileSync("lib/demo.ts", "utf8")));
const mockEnv = uri('export const env = {GMGN_API_KEY:"test-key"};');
let code = compile(fs.readFileSync("lib/market.ts", "utf8"))
  .replace('"cloudflare:workers"', JSON.stringify(mockEnv))
  .replace('"./screener"', JSON.stringify(core))
  .replace('"./demo"', JSON.stringify(demo));
const { market } = await import(uri(code));
let calls = 0;
const original = globalThis.fetch;
const address = "0x" + "a".repeat(40);
globalThis.fetch = async () => {
  calls++;
  await new Promise((resolve) => setTimeout(resolve, 10));
  return Response.json({
    code: 0,
    data: {
      code: 0,
      data: {
        rank: [
          {
            address,
            symbol: "TEST",
            market_cap: 123,
            volume: 456,
            is_honeypot: 0,
            is_open_source: 1,
            is_wash_trading: false,
            rug_ratio: 0,
          },
        ],
      },
    },
  });
};
try {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => market("auto", "trending", "1h")),
  );
  assert.equal(calls, 1, "Overlapping loads must share one provider request");
  assert.equal(
    results[0].tokens.length,
    1,
    "Nested API envelopes must be unwrapped",
  );
  assert.equal(results[0].tokens[0].marketCap, 123);
  await market("gmgn", "trending", "1h");
  assert.equal(calls, 1, "Auto and explicit GMGN must share the cached result");
  globalThis.fetch = async () => {
    calls++;
    return Response.json(
      { code: 429, reset_at: Math.floor(Date.now() / 1000) + 300 },
      { status: 429 },
    );
  };
  await assert.rejects(
    () => market("gmgn", "trending", "6h"),
    (e) => e.status === 429 && e.provider === "gmgn",
  );
  const afterLimit = calls;
  await assert.rejects(() => market("gmgn", "trending", "24h"));
  assert.equal(
    calls,
    afterLimit,
    "Cooldown must suppress further provider requests",
  );
  const d = await market("demo", "trending", "1h");
  assert.ok(d.tokens.length > 0, "Demo must work during GMGN cooldown");
  console.log(
    "7 market checks passed: concurrency, shared caching, nested responses, cooldown and demo independence.",
  );
} finally {
  globalThis.fetch = original;
}
