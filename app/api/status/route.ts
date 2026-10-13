import { env } from "cloudflare:workers";
import { authenticatedOwner } from "@/lib/auth";
export async function GET(request: Request) {
  if (!(await authenticatedOwner(request)))
    return Response.json(
      { error: "Sign in to your private dashboard." },
      { status: 401 },
    );
  return Response.json(
    {
      gmgn: !!env.GMGN_API_KEY,
      chainbase: !!env.CHAINBASE_API_KEY,
      telegram: !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_CHAT_ID,
      database: !!env.DB,
      cron: !!env.CRON_SECRET,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
