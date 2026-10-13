import { env } from "cloudflare:workers";
const cookieName = "bsc_radar_session";
async function signature(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.APP_PASSWORD!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function authenticatedOwner(
  request: Request,
): Promise<string | null> {
  // APP_PASSWORD protects standalone Cloudflare deployments, including workers.dev.
  if (env.APP_PASSWORD) {
    const raw = request.headers
      .get("Cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    if (!raw) return null;
    const [expires, mac] = raw.split(".");
    if (Number(expires) < Date.now() || !mac) return null;
    const expected = await signature(expires);
    if (mac.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++)
      diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0 ? "personal-owner" : null;
  }
  // Sites supplies trusted request identity at its private hosting boundary.
  if (env.STANDALONE_CLOUDFLARE === "true") return null;
  return request.headers.get("oai-authenticated-user-id");
}
export async function login(request: Request): Promise<Response> {
  if (!env.APP_PASSWORD)
    return Response.json(
      { error: "Sign in through the private Site." },
      { status: 400 },
    );
  const body = (await request.json().catch(() => null)) as {
    password?: string;
  } | null;
  if (body?.password !== env.APP_PASSWORD)
    return Response.json({ error: "Incorrect password." }, { status: 401 });
  const expires = String(Date.now() + 86400000);
  const mac = await signature(expires);
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${cookieName}=${expires}.${mac}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`,
        "Cache-Control": "no-store",
      },
    },
  );
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !!origin && origin === new URL(request.url).origin;
}
