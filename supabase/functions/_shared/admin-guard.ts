import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Resolve the caller and confirm they hold one of the allowed roles.
 * Returns either { user, admin } or a ready-to-return error Response.
 */
export async function requireRole(
  req: Request,
  roles: Array<"admin" | "staff">,
): Promise<{ user: { id: string; email?: string }; admin: ReturnType<typeof adminClient>; roles: string[] } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "You must be signed in." }, 401);

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await authed.auth.getUser();
  if (error || !user) return json({ error: "Your session has expired. Please sign in again." }, 401);

  const admin = adminClient();
  const { data: roleRows } = await admin
    .from("user_roles").select("role").eq("user_id", user.id);
  const held = (roleRows || []).map((r: { role: string }) => r.role);
  if (!roles.some((r) => held.includes(r))) {
    return json({ error: `Forbidden — ${roles.join(" or ")} access required.` }, 403);
  }
  return { user: { id: user.id, email: user.email ?? undefined }, admin, roles: held };
}

/** Readable temporary password: 12 chars, no ambiguous glyphs. */
export function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%";
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 12) chars.push(pick(all));
  return chars.sort(() => Math.random() - 0.5).join("");
}

/** Find an existing auth user by email without listing the whole directory. */
export async function findAuthUserByEmail(
  admin: ReturnType<typeof adminClient>,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  const target = email.trim().toLowerCase();
  const { data: profile } = await admin
    .from("profiles").select("user_id").ilike("email", target).maybeSingle();
  if (profile?.user_id) return { id: profile.user_id, email: target };

  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? undefined };
    if (data.users.length < 200) return null;
  }
  return null;
}
