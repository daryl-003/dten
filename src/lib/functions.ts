import { supabase } from "@/integrations/supabase/client";

/**
 * Invoke an edge function and surface the server's human-readable error text.
 * supabase-js swallows non-2xx bodies, so we read them off the error context.
 */
export async function invokeFn<T = any>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });

  if (error) {
    let message = error.message || "Request failed.";
    const ctx = (error as any).context;
    try {
      if (ctx && typeof ctx.json === "function") {
        const parsed = await ctx.clone().json();
        if (parsed?.error) message = parsed.error;
      }
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }

  if (data && typeof data === "object" && "error" in (data as any) && (data as any).error) {
    throw new Error(String((data as any).error));
  }

  return data as T;
}
