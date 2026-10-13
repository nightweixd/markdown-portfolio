import { authenticatedOwner } from "@/lib/auth";
import { market, MarketError } from "@/lib/market";
import {
  addressPattern,
  type Interval,
  type Source,
  type View,
} from "@/lib/screener";
export async function GET(request: Request) {
  if (!(await authenticatedOwner(request)))
    return Response.json(
      { error: "Sign in to your private dashboard." },
      { status: 401 },
    );
  const q = new URL(request.url).searchParams;
  const source = q.get("source") ?? "auto";
  const view = q.get("view") ?? "trending";
  const interval = q.get("interval") ?? "1h";
  const addresses = (q.get("addresses") ?? "").split(",").filter(Boolean);
  const query = (q.get("q") ?? "").trim();
  if (
    !["auto", "gmgn", "dexscreener", "demo"].includes(source) ||
    !["new", "trending"].includes(view) ||
    !["1h", "6h", "24h"].includes(interval) ||
    addresses.length > 30 ||
    addresses.some((a) => !addressPattern.test(a)) ||
    query.length > 100
  )
    return Response.json({ error: "Invalid market query" }, { status: 400 });
  try {
    return Response.json(
      await market(
        source as Source | "auto",
        view as View,
        interval as Interval,
        addresses,
        query,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error: e instanceof Error ? e.message : "Market request failed",
        retryAt: e instanceof MarketError ? e.retryAt : null,
        provider: e instanceof MarketError ? e.provider : null,
      },
      { status: e instanceof MarketError ? e.status : 502 },
    );
  }
}
