import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, clientKey, tooManyRequests } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Mask an email so public verification never leaks a full address. */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return null;
  const visible = user.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const allowed = await checkRateLimit("verify-credential", clientKey(req), {
      limit: 30,
      windowSeconds: 300,
    });
    if (!allowed) return tooManyRequests(corsHeaders);

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!raw || raw.length < 4 || raw.length > 40) {
      return json({ error: "Enter a valid enrollment ID or certificate number." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Certificate number lookup first (DTEN-CERT-...)
    if (raw.includes("CERT")) {
      const { data: cert } = await admin
        .from("certificates")
        .select("certificate_number, type, course, student_name, issued_date, issued_by, description, enrollment_id")
        .eq("certificate_number", raw)
        .maybeSingle();

      if (!cert) return json({ found: false });

      return json({
        found: true,
        kind: "certificate",
        certificate: {
          certificate_number: cert.certificate_number,
          type: cert.type,
          course: cert.course,
          student_name: cert.student_name,
          issued_date: cert.issued_date,
          issued_by: cert.issued_by,
          description: cert.description,
        },
        enrollment_id: cert.enrollment_id,
      });
    }

    const { data: enrollment } = await admin
      .from("enrollments")
      .select("enrollment_id, full_name, email, course, status, created_at")
      .eq("enrollment_id", raw)
      .maybeSingle();

    if (!enrollment) return json({ found: false });

    const { data: certs } = await admin
      .from("certificates")
      .select("certificate_number, type, course, student_name, issued_date, issued_by, description")
      .eq("enrollment_id", raw)
      .order("issued_date", { ascending: false });

    return json({
      found: true,
      kind: "enrollment",
      enrollment: {
        enrollment_id: enrollment.enrollment_id,
        full_name: enrollment.full_name,
        email: maskEmail(enrollment.email),
        course: enrollment.course,
        status: enrollment.status,
        created_at: enrollment.created_at,
      },
      certificates: certs || [],
    });
  } catch (err) {
    console.error("verify-credential error:", err);
    return json({ error: "Verification is temporarily unavailable. Please try again." }, 500);
  }
});
