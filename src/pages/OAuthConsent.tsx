import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import darylLogo from "@/assets/daryl-tech-logo.png.asset.json";

type OAuthClient = { name?: string; client_name?: string; redirect_uri?: string };
type AuthorizationDetails = {
  client?: OAuthClient;
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
};

// Minimal typed view of the beta supabase.auth.oauth namespace.
const oauthApi = () =>
  (supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
      approveAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
      denyAuthorization: (id: string) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
    };
  }).oauth;

const scopeLabel = (scope: string) => {
  switch (scope) {
    case "openid":
      return "Confirm who you are";
    case "profile":
      return "Share your basic profile";
    case "email":
      return "Share your email address";
    default:
      return `Additional permission requested: ${scope}`;
  }
};

const OAuthConsent = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authorizationId) {
        setError("This authorization link is missing or invalid.");
        setLoading(false);
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const next = window.location.pathname + window.location.search;
        window.location.replace(`/auth?redirect=${encodeURIComponent(next)}`);
        return;
      }
      if (cancelled) return;
      setEmail(user.email ?? null);
      try {
        const { data, error: err } = await oauthApi().getAuthorizationDetails(authorizationId);
        if (err) throw new Error(err.message);
        const redirect = data?.redirect_url ?? data?.redirect_to;
        if (redirect && !data?.client) {
          window.location.replace(redirect);
          return;
        }
        if (!cancelled) setDetails(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load this authorization request.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authorizationId]);

  const decide = async (kind: "approve" | "deny") => {
    if (!authorizationId) return;
    setWorking(kind);
    setError(null);
    try {
      const api = oauthApi();
      const { data, error: err } = kind === "approve"
        ? await api.approveAuthorization(authorizationId)
        : await api.denyAuthorization(authorizationId);
      if (err) throw new Error(err.message);
      const redirect = data?.redirect_url ?? data?.redirect_to;
      if (redirect) window.location.replace(redirect);
      else setError("The authorization completed but no redirect was returned.");
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${kind} this request.`);
    } finally {
      setWorking(null);
    }
  };

  const client = details?.client;
  const clientName = client?.client_name || client?.name || "This application";
  const scopes = details?.scopes ?? (details?.scope ? details.scope.split(" ").filter(Boolean) : ["openid", "email", "profile"]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-8 backdrop-blur">
        <img src={darylLogo.url} alt="Daryl Tech Educational Network" className="mb-6 h-10 w-auto object-contain" />

        {loading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading authorization request…
          </div>
        ) : error ? (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold text-foreground">Authorization unavailable</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                Connect {clientName} to Daryl Tech
              </h1>
              {email && (
                <p className="mt-1 text-sm text-muted-foreground">Signed in as {email}</p>
              )}
            </div>

            <p className="text-sm text-foreground/80">
              {clientName} will be able to use this app's enabled tools while you are signed in.
            </p>

            {client?.redirect_uri && (
              <p className="break-all text-xs text-muted-foreground">Redirects to {client.redirect_uri}</p>
            )}

            <ul className="space-y-2 rounded-lg border border-border/50 p-4 text-sm">
              {scopes.map((s) => (
                <li key={s} className="flex items-start gap-2 text-foreground/80">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  {scopeLabel(s)}
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              This does not bypass this app's permissions or backend policies.
            </p>

            <div className="flex gap-3">
              <Button className="flex-1" disabled={working !== null} onClick={() => decide("approve")}>
                {working === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}
              </Button>
              <Button variant="outline" className="flex-1" disabled={working !== null} onClick={() => decide("deny")}>
                {working === "deny" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel connection"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default OAuthConsent;
