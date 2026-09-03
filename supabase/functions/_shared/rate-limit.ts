import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Best-effort client identifier: authenticated user id when present, else IP. */
export function clientKey(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  return `ip:${ip}`;
}

/**
 * Fixed-window rate limit backed by public.rate_limits.
 * Returns true when the call is allowed. Fails open on infrastructure errors
 * so a database hiccup never takes the whole endpoint down.
 */
export async function checkRateLimit(
  scope: string,
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number },
): Promise<boolean> {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin.rpc("bump_rate_limit", {
      _key: `${scope}:${key}`,
      _window_seconds: windowSeconds,
      _limit: limit,
    });
    if (error) {
      console.error("rate limit check failed:", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("rate limit check threw:", e);
    return true;
  }
}

export function tooManyRequests(corsHeaders: Record<string, string>, retryAfter = 60) {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again shortly." }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}

/** Resolve the caller from a bearer token, or null when unauthenticated/invalid. */
export async function getCaller(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await client.auth.getUser();
    return user ? { id: user.id, email: user.email ?? undefined } : null;
  } catch {
    return null;
  }
}
