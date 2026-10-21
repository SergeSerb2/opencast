import { HttpError } from "./validation";

export interface AuthEnvironment { SYNC_TOKEN?: string; SYNC_TOKENS?: string }
// Hash both values to fixed length before comparing, including for unknown tokens.
async function equal(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  let difference = 0;
  for (let i = 0; i < aa.length; i++) difference |= aa[i] ^ bb[i];
  return difference === 0;
}
export async function authenticate(request: Request, env: AuthEnvironment): Promise<string> {
  if (!env.SYNC_TOKEN && !env.SYNC_TOKENS) throw new HttpError(503, "not_configured", "Set the SYNC_TOKEN secret on this Worker");
  const header = request.headers.get("Authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tokens: [string, string][] = [];
  if (env.SYNC_TOKEN) tokens.push(["default", env.SYNC_TOKEN]);
  for (const pair of (env.SYNC_TOKENS ?? "").split(",")) {
    const colon = pair.indexOf(":");
    if (colon > 0 && colon < pair.length - 1) tokens.push([pair.slice(0, colon).trim(), pair.slice(colon + 1).trim()]);
  }
  let account: string | undefined;
  for (const [name, token] of tokens) if (await equal(supplied, token)) account = name;
  if (!supplied || !account) throw new HttpError(401, "unauthorized", "A valid sync token is required");
  return account;
}
