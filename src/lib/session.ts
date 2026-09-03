import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for the current auth session.
 *
 * Calling `supabase.auth.getSession()` from many components at once makes each
 * caller contend for the Navigator LockManager lock the Supabase client uses to
 * guard token refresh, which surfaces as
 * "Navigator LockManager: lock 'sb-...-auth-token' timed out".
 * Everything here shares ONE in-flight read and then stays fresh purely from
 * `onAuthStateChange`, so the lock is acquired at most once per page load.
 */

let cached: Session | null = null;
let primed = false;
let inFlight: Promise<Session | null> | null = null;
let subscribed = false;

function subscribeOnce() {
  if (subscribed) return;
  subscribed = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    cached = session;
    primed = true;
  });
}

/** Resolve the current session, reusing a single underlying read. */
export async function getCurrentSession(): Promise<Session | null> {
  subscribeOnce();
  if (primed) return cached;
  if (!inFlight) {
    inFlight = supabase.auth
      .getSession()
      .then(({ data }) => {
        cached = data.session;
        primed = true;
        return cached;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Drop-in replacement for `supabase.auth.getSession()` that shares one read.
 * Returns the same `{ data: { session } }` shape.
 */
export async function getSessionOnce(): Promise<{ data: { session: Session | null } }> {
  return { data: { session: await getCurrentSession() } };
}

/** Subscribe to session changes without triggering an extra `getSession()`. */
export function onSessionChange(cb: (session: Session | null) => void) {
  subscribeOnce();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
