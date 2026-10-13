export type Source = "gmgn" | "dexscreener" | "demo";
export type View = "trending" | "new";
export type Interval = "1h" | "6h" | "24h";
export interface Token {
  address: string;
  symbol: string;
  name: string;
  platform: string;
  price: number | null;
  marketCap: number | null;
  liquidity: number | null;
  volume: number | null;
  change: number | null;
  createdAt: number | null;
  holders: number | null;
  buys: number | null;
  sells: number | null;
  honeypot: boolean | null;
  verified: boolean | null;
  washTrading: boolean | null;
  top10: number | null;
  rug: number | null;
  smartMoney: number | null;
  source: Source;
  pairUrl: string | null;
}
export interface Filters {
  minLiquidity: number;
  minVolume: number;
  minMarketCap: number;
  maxMarketCap: number;
  maxAgeHours: number;
  minChange: number;
  maxTop10: number;
  verifiedOnly: boolean;
  excludeFlagged: boolean;
}
export const defaultFilters: Filters = {
  minLiquidity: 0,
  minVolume: 0,
  minMarketCap: 0,
  maxMarketCap: 0,
  maxAgeHours: 0,
  minChange: -100,
  maxTop10: 100,
  verifiedOnly: false,
  excludeFlagged: true,
};
export const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export function numeric(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  )
    return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
export function flag(value: unknown): boolean | null {
  if ([true, 1, "1", "true", "yes"].includes(value as never)) return true;
  if ([false, 0, "0", "false", "no"].includes(value as never)) return false;
  return null;
}
export function matches(token: Token, f: Filters, now = Date.now()): boolean {
  if (
    f.minLiquidity > 0 &&
    (token.liquidity === null || token.liquidity < f.minLiquidity)
  )
    return false;
  if (f.minVolume > 0 && (token.volume === null || token.volume < f.minVolume))
    return false;
  if (
    f.minMarketCap > 0 &&
    (token.marketCap === null || token.marketCap < f.minMarketCap)
  )
    return false;
  if (
    f.maxMarketCap > 0 &&
    (token.marketCap === null || token.marketCap > f.maxMarketCap)
  )
    return false;
  if (
    f.maxAgeHours > 0 &&
    (token.createdAt === null ||
      (now / 1000 - token.createdAt) / 3600 > f.maxAgeHours)
  )
    return false;
  if (
    f.minChange > -100 &&
    (token.change === null || token.change < f.minChange)
  )
    return false;
  if (
    f.maxTop10 < 100 &&
    (token.top10 === null || token.top10 * 100 > f.maxTop10)
  )
    return false;
  if (
    f.verifiedOnly &&
    (token.verified !== true ||
      token.honeypot !== false ||
      token.washTrading !== false ||
      token.rug === null)
  )
    return false;
  if (
    f.excludeFlagged &&
    (token.honeypot === true ||
      token.washTrading === true ||
      (token.rug !== null && token.rug > 0.3))
  )
    return false;
  return true;
}
export function parseFilters(input: unknown): Filters {
  if (!input || typeof input !== "object") throw new Error("Invalid filters");
  const raw = input as Record<string, unknown>;
  const f = { ...defaultFilters };
  for (const key of [
    "minLiquidity",
    "minVolume",
    "minMarketCap",
    "maxMarketCap",
    "maxAgeHours",
    "minChange",
    "maxTop10",
  ] as const) {
    const n = numeric(raw[key]);
    if (n === null || n < (key === "minChange" ? -100 : 0) || n > 1e12)
      throw new Error("Invalid filter: " + key);
    f[key] = n;
  }
  if (
    f.maxTop10 > 100 ||
    (f.maxMarketCap > 0 && f.maxMarketCap < f.minMarketCap)
  )
    throw new Error("Invalid filter range");
  if (
    typeof raw.verifiedOnly !== "boolean" ||
    typeof raw.excludeFlagged !== "boolean"
  )
    throw new Error("Invalid risk filters");
  f.verifiedOnly = raw.verifiedOnly;
  f.excludeFlagged = raw.excludeFlagged;
  return f;
}
export function riskLabel(t: Token): "Flagged" | "Incomplete" | "No flags" {
  if (
    t.honeypot === true ||
    t.washTrading === true ||
    (t.rug !== null && t.rug > 0.3)
  )
    return "Flagged";
  if (
    t.honeypot === null ||
    t.verified === null ||
    t.washTrading === null ||
    t.rug === null
  )
    return "Incomplete";
  return "No flags";
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
export function normalizeGmgn(
  row: Record<string, unknown>,
  interval: Interval,
  trenches = false,
): Token | null {
  const address = String(row.address ?? "");
  if (!addressPattern.test(address)) return null;
  return {
    address: address.toLowerCase(),
    symbol: String(row.symbol ?? "Unknown").slice(0, 30),
    name: String(row.name ?? "Unnamed token").slice(0, 100),
    platform: String(row.launchpad_platform ?? row.exchange ?? "BSC").slice(
      0,
      50,
    ),
    price: numeric(row.price),
    marketCap: numeric(
      trenches ? (row.usd_market_cap ?? row.market_cap) : row.market_cap,
    ),
    liquidity: numeric(row.liquidity),
    volume: numeric(
      trenches
        ? row[interval === "1h" ? "volume_1h" : "volume_24h"]
        : row.volume,
    ),
    change: trenches ? null : numeric(row.price_change_percent),
    createdAt: numeric(
      trenches ? row.created_timestamp : row.creation_timestamp,
    ),
    holders: numeric(row.holder_count),
    buys: numeric(trenches ? row.buys_24h : row.buys),
    sells: numeric(trenches ? row.sells_24h : row.sells),
    honeypot: flag(row.is_honeypot),
    verified: flag(trenches ? row.open_source : row.is_open_source),
    washTrading: flag(row.is_wash_trading),
    top10: numeric(row.top_10_holder_rate),
    rug: numeric(row.rug_ratio),
    smartMoney: numeric(row.smart_degen_count),
    source: "gmgn",
    pairUrl: null,
  };
}
export function normalizeDex(
  row: Record<string, any>,
  interval: Interval,
): Token | null {
  if (
    row.chainId !== "bsc" ||
    !addressPattern.test(row.baseToken?.address ?? "")
  )
    return null;
  const window = interval === "1h" ? "h1" : interval === "6h" ? "h6" : "h24";
  return {
    address: row.baseToken.address.toLowerCase(),
    symbol: String(row.baseToken.symbol ?? "Unknown").slice(0, 30),
    name: String(row.baseToken.name ?? "Unnamed token").slice(0, 100),
    platform: String(row.dexId ?? "BSC"),
    price: numeric(row.priceUsd),
    marketCap: numeric(row.marketCap),
    liquidity: numeric(row.liquidity?.usd),
    volume: numeric(row.volume?.[window]),
    change: numeric(row.priceChange?.[window]),
    createdAt:
      numeric(row.pairCreatedAt) === null
        ? null
        : Number(row.pairCreatedAt) / 1000,
    holders: null,
    buys: numeric(row.txns?.[window]?.buys),
    sells: numeric(row.txns?.[window]?.sells),
    honeypot: null,
    verified: null,
    washTrading: null,
    top10: null,
    rug: null,
    smartMoney: null,
    source: "dexscreener",
    pairUrl: safeUrl(row.url),
  };
}
export function deduplicate(tokens: Token[]): Token[] {
  const map = new Map<string, Token>();
  for (const t of tokens) {
    const old = map.get(t.address);
    if (!old || (t.liquidity ?? 0) > (old.liquidity ?? 0))
      map.set(t.address, t);
  }
  return [...map.values()];
}
