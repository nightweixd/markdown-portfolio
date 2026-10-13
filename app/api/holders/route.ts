import { authenticatedOwner } from "@/lib/auth";
import { addressPattern } from "@/lib/screener";
import { chainbaseHolders } from "@/lib/chainbase";
export async function GET(request: Request) {
  if (!(await authenticatedOwner(request)))
    return Response.json({ error: "Sign in required" }, { status: 401 });
  const address = new URL(request.url).searchParams.get("address") ?? "";
  if (!addressPattern.test(address))
    return Response.json({ error: "Invalid BSC contract" }, { status: 400 });
  try {
    return Response.json(await chainbaseHolders(address.toLowerCase()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Holder data unavailable" },
      { status: 503 },
    );
  }
}
