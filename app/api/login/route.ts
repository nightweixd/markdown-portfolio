import { login, sameOrigin } from "@/lib/auth";
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  return login(request);
}
