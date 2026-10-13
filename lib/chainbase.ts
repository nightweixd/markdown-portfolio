import { env } from "cloudflare:workers";
import { addressPattern, numeric } from "./screener";
export interface HolderData {
  total: number | null;
  holders: { address: string; amount: string }[];
  fetchedAt: number;
}
const cache = new Map<string, { until: number; value: HolderData }>();
let cooldown = 0;
export async function chainbaseHolders(address: string): Promise<HolderData> {
  if (!env.CHAINBASE_API_KEY)
    throw new Error("Chainbase key is not configured.");
  if (Date.now() < cooldown)
    throw new Error(
      "Chainbase rate limit cooldown is active. Try again in a minute.",
    );
  const old = cache.get(address);
  if (old && old.until > Date.now()) return old.value;
  const url = new URL("https://api.chainbase.online/v1/token/top-holders");
  url.search = new URLSearchParams({
    chain_id: "56",
    contract_address: address,
    page: "1",
    limit: "10",
  }).toString();
  const r = await fetch(url, {
    headers: { "x-api-key": env.CHAINBASE_API_KEY },
    signal: AbortSignal.timeout(12000),
  });
  if (r.status === 429) {
    cooldown = Date.now() + 60000;
    throw new Error("Chainbase rate limit reached. Try again in a minute.");
  }
  const body = (await r.json()) as {
    code?: number;
    count?: unknown;
    data?: { wallet_address: unknown; amount: unknown }[];
  };
  if (!r.ok || ![0, 200].includes(body.code ?? -1))
    throw new Error(
      "Chainbase could not retrieve holders. Check key permissions and available API credits.",
    );
  const value = {
    total: numeric(body.count),
    holders: (Array.isArray(body.data) ? body.data : [])
      .filter(
        (h) =>
          typeof h.wallet_address === "string" &&
          addressPattern.test(h.wallet_address),
      )
      .map((h) => ({
        address: String(h.wallet_address),
        amount: String(h.amount ?? ""),
      })),
    fetchedAt: Date.now(),
  };
  if (cache.size > 100) cache.clear();
  cache.set(address, { until: Date.now() + 300000, value });
  return value;
}
