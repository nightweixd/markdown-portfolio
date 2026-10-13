import { authenticatedOwner, sameOrigin } from "@/lib/auth";
import { sendTelegram } from "@/lib/alerts";
export async function POST(request: Request) {
  if (!(await authenticatedOwner(request)))
    return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  try {
    await sendTelegram(
      "BSC Radar is connected. Your Telegram test alert was delivered.",
    );
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Telegram test failed" },
      { status: 503 },
    );
  }
}
