import { env } from "cloudflare:workers";
import { market } from "./market";
import {
  matches,
  parseFilters,
  type Interval,
  type Source,
  type View,
} from "./screener";
export interface StoredRule {
  id: string;
  owner: string;
  name: string;
  filters: string;
  source: Source | "auto";
  view: View;
  interval: Interval;
  enabled: number;
  created_at: number;
}
export async function sendTelegram(text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    throw new Error("Telegram server secrets are not configured.");
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        link_preview_options: { is_disabled: true },
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const body = (await response.json()) as { ok?: boolean };
  if (!response.ok || !body.ok)
    throw new Error(
      "Telegram delivery failed. Check the bot token and chat ID.",
    );
}
export async function runAlerts(): Promise<{
  sent: number;
  checked: number;
  errors: number;
}> {
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID)
    throw new Error(
      "Background alerts need database and Telegram configuration.",
    );
  const { results } = await env.DB.prepare(
    "SELECT * FROM alert_rules WHERE enabled = 1 ORDER BY created_at LIMIT 20",
  ).all<StoredRule>();
  let sent = 0;
  let checked = 0;
  let errors = 0;
  for (const rule of results) {
    if (rule.source === "demo") continue;
    try {
      const stored = JSON.parse(rule.filters);
      const data = await market(
        rule.source,
        rule.view,
        rule.interval,
        stored.addresses ?? [],
      );
      const filters = parseFilters(stored);
      checked++;
      const tokens = data.tokens.filter((t) => matches(t, filters));
      for (const token of tokens.slice(0, 10)) {
        const now = Math.floor(Date.now() / 1000);
        const hour = Math.floor(now / 3600);
        const id = `${rule.id}:${token.address}:${hour}`;
        const claim = await env.DB.prepare(
          "INSERT OR IGNORE INTO alert_deliveries (id,rule_id,address,sent_at) VALUES (?,?,?,?)",
        )
          .bind(id, rule.id, token.address, now)
          .run();
        if (claim.meta.changes === 0) continue;
        try {
          const money = (v: number | null) =>
            v === null
              ? "Unknown"
              : "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
          await sendTelegram(
            `BSC Radar · ${rule.name}\n${token.symbol} — ${token.name}\nLiquidity: ${money(token.liquidity)}\n${data.interval} volume: ${money(token.volume)}\n${token.address}\nSource: ${data.source}\nhttps://gmgn.ai/bsc/token/${token.address}\nReported metrics only; risk data may be incomplete.`,
          );
          sent++;
        } catch {
          await env.DB.prepare("DELETE FROM alert_deliveries WHERE id = ?")
            .bind(id)
            .run();
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }
  await env.DB.prepare("DELETE FROM alert_deliveries WHERE sent_at < ?")
    .bind(Math.floor(Date.now() / 1000) - 172800)
    .run();
  return { sent, checked, errors };
}
