import { env } from "cloudflare:workers";
import { runAlerts } from "@/lib/alerts";
export async function POST(request: Request) {
  if (
    !env.CRON_SECRET ||
    request.headers.get("Authorization") !== "Bearer " + env.CRON_SECRET
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runAlerts());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Monitor failed" },
      { status: 503 },
    );
  }
}
