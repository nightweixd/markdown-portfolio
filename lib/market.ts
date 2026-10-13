import { env } from "cloudflare:workers";
import { demoTokens } from "./demo";
import {
  addressPattern,
  deduplicate,
  normalizeDex,
  normalizeGmgn,
  type Interval,
  type Source,
  type Token,
  type View,
} from "./screener";
export class MarketError extends Error {
  constructor(
    message: string,
    public status = 502,
    public retryAt: number | null = null,
  ) {
    super(message);
  }
}
type Result = {
  tokens: Token[];
  source: Source;
  fetchedAt: number;
  coverage: string;
  interval: Interval;
};
const cache = new Map<string, { until: number; result: Result }>();
let gmgnCooldownUntil = 0;
async function jsonFetch(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(12000),
  });
  const body = (await response.json().catch(() => null)) as Record<
    string,
    any
  > | null;
  if (response.status === 429 || body?.code === 429) {
    const reset =
      Number(body?.reset_at || response.headers.get("X-RateLimit-Reset")) ||
      Math.floor(Date.now() / 1000) + 300;
    if (url.startsWith("https://openapi.gmgn.ai/"))
      gmgnCooldownUntil = reset * 1000;
    throw new MarketError(
      "Data provider rate limit reached. Refresh pauses until the cooldown ends.",
      429,
      reset,
    );
  }
  if (
    !response.ok ||
    (body?.code != null && ![0, 200, "0", "200"].includes(body.code))
  )
    throw new MarketError(
      response.status === 401 || response.status === 403
        ? "GMGN access denied. Check your API key, permissions and IP whitelist."
        : "The market data provider could not complete this request.",
    );
  return body;
}
// Mirrors gmgn-cli exist-auth routes. Workers cannot execute a local CLI.
export async function gmgn(
  path: string,
  query: Record<string, string> = {},
  body?: unknown,
): Promise<any> {
  if (!env.GMGN_API_KEY)
    throw new MarketError("GMGN API key is not configured on the server.", 503);
  if (gmgnCooldownUntil > Date.now())
    throw new MarketError(
      "GMGN cooldown is active.",
      429,
      Math.ceil(gmgnCooldownUntil / 1000),
    );
  const params = new URLSearchParams({
    ...query,
    timestamp: String(Math.floor(Date.now() / 1000)),
    client_id: crypto.randomUUID(),
  });
  return jsonFetch("https://openapi.gmgn.ai" + path + "?" + params, {
    method: body ? "POST" : "GET",
    headers: {
      "X-APIKEY": env.GMGN_API_KEY,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
export async function market(
  source: Source | "auto",
  view: View,
  interval: Interval,
  addresses: string[] = [],
  query = "",
): Promise<Result> {
  const actual: Source =
    source === "auto" ? (env.GMGN_API_KEY ? "gmgn" : "dexscreener") : source;
  const key = JSON.stringify([
    actual,
    view,
    interval,
    addresses.slice(0, 30),
    query,
  ]);
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return saved.result;
  let tokens: Token[] = [];
  let coverage = "";
  let effectiveInterval = interval;
  if (actual === "demo") {
    tokens = demoTokens(interval);
    if (query)
      tokens = tokens.filter((t) =>
        (t.symbol + " " + t.name + " " + t.address)
          .toLowerCase()
          .includes(query.toLowerCase()),
      );
    if (view === "new")
      tokens = tokens.filter(
        (t) => Date.now() / 1000 - (t.createdAt ?? 0) < 86400,
      );
    coverage =
      "Fictional sample tokens. Demo mode is for trying the dashboard; no live prices or Telegram alerts.";
  } else if (actual === "gmgn") {
    if (query || addresses.length) {
      const terms = query ? [query] : addresses.slice(0, 30);
      for (const term of terms) {
        const r = await gmgn("/v1/market/search", { chain: "bsc", q: term });
        const coins = r.data?.coins ?? [];
        for (const coin of coins) {
          if (coin.chain !== "bsc") continue;
          const token = normalizeGmgn(
            { ...coin, market_cap: coin.mcp },
            interval,
          );
          if (token) tokens.push(token);
        }
      }
      coverage =
        "GMGN BSC search results. Search may omit volume, liquidity and risk fields; missing values remain unknown.";
    } else if (view === "new") {
      // Trenches exposes 1h and 24h volume, not 6h. Keep labels accurate.
      effectiveInterval = interval === "1h" ? "1h" : "24h";
      const section = {
        filters: ["offchain", "onchain"],
        launchpad_platform_v2: true,
        limit: 80,
      };
      const r = await gmgn(
        "/v1/trenches",
        { chain: "bsc" },
        {
          version: "v2",
          new_creation: section,
          near_completion: section,
          completed: section,
        },
      );
      for (const name of ["new_creation", "pump", "completed"]) {
        const rows = r.data?.[name];
        const items = Array.isArray(rows) ? rows : rows?.list;
        if (Array.isArray(items))
          for (const row of items) {
            const t = normalizeGmgn(row, effectiveInterval, true);
            if (t) tokens.push(t);
          }
      }
      coverage =
        "GMGN launchpad listings (new, near graduation and graduated). Not every BSC contract. Buy/sell counts use 24h; launchpad price change is unavailable.";
    } else {
      const r = await gmgn("/v1/market/rank", {
        chain: "bsc",
        interval,
        limit: "100",
        order_by: "volume",
        direction: "desc",
      });
      tokens = (r.data?.rank ?? [])
        .map((row: Record<string, unknown>) => normalizeGmgn(row, interval))
        .filter(Boolean);
      coverage =
        "GMGN BSC ranking, up to 100 tokens. Provider defaults apply: non-honeypot, verified and renounced. This is a discovery list, not a complete chain scan.";
    }
  } else {
    let pairs: any[] = [];
    if (addresses.length || addressPattern.test(query)) {
      const ids = addresses.length ? addresses : [query];
      pairs = await jsonFetch(
        "https://api.dexscreener.com/tokens/v1/bsc/" +
          ids.slice(0, 30).join(","),
      );
    } else if (query) {
      const r = await jsonFetch(
        "https://api.dexscreener.com/latest/dex/search?q=" +
          encodeURIComponent(query),
      );
      pairs = r.pairs ?? [];
    } else {
      const profiles = await jsonFetch(
        "https://api.dexscreener.com/token-profiles/latest/v1",
      );
      const boosts = await jsonFetch(
        "https://api.dexscreener.com/token-boosts/top/v1",
      );
      const ids = [
        ...new Set(
          [...profiles, ...boosts]
            .filter(
              (p) => p.chainId === "bsc" && addressPattern.test(p.tokenAddress),
            )
            .map((p) => String(p.tokenAddress)),
        ),
      ].slice(0, 30);
      if (ids.length)
        pairs = await jsonFetch(
          "https://api.dexscreener.com/tokens/v1/bsc/" + ids.join(","),
        );
    }
    tokens = deduplicate(
      pairs.map((p) => normalizeDex(p, interval)).filter(Boolean) as Token[],
    );
    if (view === "new" && !query && !addresses.length)
      tokens = tokens.filter(
        (t) => t.createdAt !== null && Date.now() / 1000 - t.createdAt < 86400,
      );
    coverage =
      "DEX Screener public fallback: BSC tokens discovered through recent profiles and top paid boosts, sorted locally. New means pairs under 24h. Pair age is not contract age. Risk and holder data are unavailable; this is not a full trending feed.";
  }
  tokens = deduplicate(tokens).sort((a, b) =>
    view === "new"
      ? (b.createdAt ?? 0) - (a.createdAt ?? 0)
      : (b.volume ?? 0) - (a.volume ?? 0),
  );
  const result = {
    tokens,
    source: actual,
    fetchedAt: Date.now(),
    coverage,
    interval: effectiveInterval,
  };
  if (cache.size > 100) cache.clear();
  cache.set(key, { until: Date.now() + 60000, result });
  return result;
}
