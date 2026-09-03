import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { bucket, path } = body;

    if (!bucket || !path) {
      return new Response(JSON.stringify({ error: "Missing bucket or path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const ALLOWED_BUCKETS = ["offer-letters", "student-cvs", "task-submissions"];
    if (!ALLOWED_BUCKETS.includes(bucket)) {
      return new Response(JSON.stringify({ error: "Invalid bucket" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    const isStaff = (roles ?? []).some((r: { role: string }) => r.role === "staff");

    const ownsEnrollment = async (enrollmentId: string | null | undefined) => {
      if (!enrollmentId) return false;
      const { data } = await supabase
        .from("enrollments")
        .select("enrollment_id")
        .eq("enrollment_id", enrollmentId)
        .eq("email", user.email)
        .maybeSingle();
      return !!data;
    };

    const denied = () =>
      new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (!isAdmin) {
      if (bucket === "offer-letters") {
        const { data: offer } = await supabase
          .from("internship_offers")
          .select("enrollment_id")
          .eq("file_url", path)
          .maybeSingle();
        if (!offer || !(await ownsEnrollment(offer.enrollment_id))) return denied();
      } else if (bucket === "task-submissions") {
        const { data: submission } = await supabase
          .from("task_submissions")
          .select("student_email")
          .eq("file_url", path)
          .maybeSingle();
        const isOwner = !!submission && submission.student_email === user.email;
        if (!isOwner && !isStaff) return denied();
      } else if (bucket === "student-cvs") {
        // CVs are private student documents: admins, or the student who owns them.
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("email")
          .eq("cv_url", path)
          .eq("email", user.email)
          .maybeSingle();
        if (!enrollment) return denied();
      }
    }


    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);

    if (error) throw error;

    return new Response(JSON.stringify({ signedUrl: data.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
