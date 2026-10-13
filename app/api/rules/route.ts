import { env } from "cloudflare:workers";
import { authenticatedOwner, sameOrigin } from "@/lib/auth";
import { parseFilters, addressPattern } from "@/lib/screener";
export async function GET(request: Request) {
  const owner = await authenticatedOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!env.DB)
    return Response.json(
      { error: "Alert database is not configured." },
      { status: 503 },
    );
  const { results } = await env.DB.prepare(
    "SELECT * FROM alert_rules WHERE owner = ? ORDER BY created_at DESC",
  )
    .bind(owner)
    .all();
  return Response.json(
    {
      rules: results.map((r) => ({
        ...r,
        filters: parseFilters(JSON.parse(String(r.filters))),
        addresses: JSON.parse(String(r.filters)).addresses ?? [],
        enabled: !!r.enabled,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const owner = await authenticatedOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!env.DB)
    return Response.json(
      { error: "Alert database is not configured." },
      { status: 503 },
    );
  try {
    const input = (await request.json()) as Record<string, any>;
    const filters = parseFilters(input.filters);
    const addresses = input.addresses ?? [];
    if (
      !Array.isArray(addresses) ||
      addresses.length > 30 ||
      addresses.some((a) => typeof a !== "string" || !addressPattern.test(a))
    )
      throw new Error("Invalid watchlist scope");
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 60 ||
      !["auto", "gmgn", "dexscreener"].includes(input.source) ||
      !["new", "trending"].includes(input.view) ||
      !["1h", "6h", "24h"].includes(input.interval)
    )
      throw new Error("Invalid alert rule");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM alert_rules WHERE owner = ?",
    )
      .bind(owner)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= 20)
      throw new Error("Limit reached: 20 alert rules");
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO alert_rules (id,owner,name,filters,source,view,interval,enabled,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        owner,
        input.name.trim(),
        JSON.stringify({ ...filters, addresses }),
        input.source,
        input.view,
        input.view === "new" &&
          input.source === "gmgn" &&
          input.interval === "6h"
          ? "24h"
          : input.interval,
        1,
        Date.now(),
      )
      .run();
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid rule" },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  const owner = await authenticatedOwner(request);
  if (!owner)
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  if (!env.DB)
    return Response.json({ error: "Database unavailable" }, { status: 503 });
  const id = new URL(request.url).searchParams.get("id");
  await env.DB.prepare("DELETE FROM alert_rules WHERE id = ? AND owner = ?")
    .bind(id, owner)
    .run();
  return Response.json({ ok: true });
}
