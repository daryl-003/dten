import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

/**
 * Build a Supabase client that acts as the signed-in MCP caller.
 * The verified OAuth bearer is forwarded so row level security applies —
 * tools can never read more than the user could read in the app itself.
 */
export function callerClient(ctx: ToolContext) {
  const token = ctx.getToken();
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

export function unauthorized() {
  return {
    content: [{ type: "text" as const, text: "You must be signed in to use this tool." }],
    isError: true,
  };
}
