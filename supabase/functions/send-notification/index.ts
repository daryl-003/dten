import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, clientKey, getCaller, tooManyRequests } from "../_shared/rate-limit.ts";

/** Escape user-supplied values before interpolating them into email HTML. */
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RECIPIENT = "daryltecheducationalnetwork@gmail.com";

interface NotificationPayload {
  type: "contact" | "booking" | "enrollment" | "task_submitted" | "task_assigned" | "payment_receipt";
  data: Record<string, string>;
}

function buildEmail(payload: NotificationPayload): { subject: string; html: string } {
  const { type, data } = payload;

  if (type === "contact") {
    return {
      subject: `New Contact Inquiry from ${esc(data.name)}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${esc(data.name)}</p>
        <p><strong>Email:</strong> ${esc(data.email)}</p>
        <p><strong>Subject:</strong> ${esc(data.subject)}</p>
        <p><strong>Message:</strong></p>
        <p>${esc(data.message)}</p>
      `,
    };
  }

  if (type === "booking") {
    return {
      subject: `New Booking Request from ${esc(data.name)}`,
      html: `
        <h2>New Consultation Booking</h2>
        <p><strong>Name:</strong> ${esc(data.name)}</p>
        <p><strong>Email:</strong> ${esc(data.email)}</p>
        <p><strong>Phone:</strong> ${esc(data.phone || "N/A")}</p>
        <p><strong>Service:</strong> ${esc(data.service)}</p>
        <p><strong>Preferred Date:</strong> ${esc(data.preferred_date)}</p>
        <p><strong>Preferred Time:</strong> ${esc(data.preferred_time)}</p>
        <p><strong>Message:</strong> ${esc(data.message || "N/A")}</p>
      `,
    };
  }

  if (type === "task_submitted") {
    return {
      subject: `New Task Submission: ${esc(data.task_title)} by ${esc(data.student_name)}`,
      html: `
        <h2>New Task Submission</h2>
        <p><strong>Student:</strong> ${esc(data.student_name)}</p>
        <p><strong>Email:</strong> ${esc(data.student_email || "N/A")}</p>
        <p><strong>Course:</strong> ${esc(data.course)}</p>
        <p><strong>Task:</strong> ${esc(data.task_title)}</p>
        <p><strong>Enrollment ID:</strong> ${esc(data.enrollment_id || "N/A")}</p>
        <p>Please review this submission in the dashboard.</p>
      `,
    };
  }

  if (type === "task_assigned") {
    return {
      subject: `Task Assigned: ${esc(data.task_title)} to ${esc(data.student_name)}`,
      html: `
        <h2>Task Assigned</h2>
        <p><strong>Student:</strong> ${esc(data.student_name)}</p>
        <p><strong>Course:</strong> ${esc(data.course)}</p>
        <p><strong>Task:</strong> ${esc(data.task_title)}</p>
        <p><strong>Due Date:</strong> ${esc(data.due_date || "No deadline")}</p>
      `,
    };
  }

  if (type === "payment_receipt") {
    return {
      subject: `Payment Receipt — ${esc(data.course)} (GH₵${esc(data.amount_ghs)})`,
      html: `
        <h2>Payment Confirmed ✅</h2>
        <p>Thank you! Your payment has been received and your enrollment is now active.</p>
        <table style="border-collapse:collapse;margin-top:12px">
          <tr><td style="padding:6px 12px"><strong>Student Email</strong></td><td style="padding:6px 12px">${esc(data.email)}</td></tr>
          <tr><td style="padding:6px 12px"><strong>Course</strong></td><td style="padding:6px 12px">${esc(data.course)}</td></tr>
          <tr><td style="padding:6px 12px"><strong>Amount Paid</strong></td><td style="padding:6px 12px">GH₵${esc(data.amount_ghs)}</td></tr>
          <tr><td style="padding:6px 12px"><strong>Enrollment ID</strong></td><td style="padding:6px 12px"><code>${esc(data.enrollment_id)}</code></td></tr>
          <tr><td style="padding:6px 12px"><strong>Paystack Reference</strong></td><td style="padding:6px 12px"><code>${esc(data.reference)}</code></td></tr>
        </table>
        <p style="margin-top:16px">Welcome to <strong>Daryl Tech & Educational Network</strong>. You can now log in to your dashboard to begin learning.</p>
      `,
    };
  }

  // enrollment
  return {
    subject: `New Enrollment: ${esc(data.full_name)} — ${esc(data.course)}`,
    html: `
      <h2>New Course Enrollment</h2>
      <p><strong>Enrollment ID:</strong> ${esc(data.enrollment_id)}</p>
      <p><strong>Student:</strong> ${esc(data.full_name)}</p>
      <p><strong>Email:</strong> ${esc(data.email)}</p>
      <p><strong>Phone:</strong> ${esc(data.phone || "N/A")}</p>
      <p><strong>Course:</strong> ${esc(data.course)}</p>
      <p><strong>CV Uploaded:</strong> ${data.cv_url ? "Yes" : "No"}</p>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const caller = await getCaller(req);

    // Abuse control: anonymous callers get a tighter budget than signed-in ones.
    const allowed = await checkRateLimit("send-notification", clientKey(req, caller?.id), {
      limit: caller ? 30 : 5,
      windowSeconds: 300,
    });
    if (!allowed) return tooManyRequests(corsHeaders);

    const payload: NotificationPayload = await req.json();

    const PUBLIC_TYPES = ["contact", "booking", "enrollment", "payment_receipt"];
    const VALID_TYPES = [...PUBLIC_TYPES, "task_submitted", "task_assigned"];
    if (!payload?.type || !VALID_TYPES.includes(payload.type)) {
      return new Response(JSON.stringify({ error: "Invalid notification type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!PUBLIC_TYPES.includes(payload.type) && !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof payload.data !== "object" || payload.data === null) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Receipts must never be relayed to a caller-chosen address: the recipient is
    // resolved server-side from the enrollment that matches the Paystack reference.
    let recipient = RECIPIENT;
    if (payload.type === "payment_receipt") {
      const reference = payload.data?.reference;
      if (!reference) {
        return new Response(JSON.stringify({ error: "Missing payment reference" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: enrollment } = await admin
        .from("enrollments")
        .select("email, course, amount_ghs, enrollment_id, payment_status")
        .eq("paystack_reference", reference)
        .maybeSingle();

      if (!enrollment || enrollment.payment_status !== "paid") {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      recipient = enrollment.email;
      payload.data = {
        reference,
        email: enrollment.email,
        course: enrollment.course,
        amount_ghs: String(enrollment.amount_ghs ?? ""),
        enrollment_id: enrollment.enrollment_id,
      };
    }

    const { subject, html } = buildEmail(payload);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Daryl Tech <onboarding@resend.dev>",
        to: [recipient],
        bcc: payload.type === "payment_receipt" ? [RECIPIENT] : undefined,
        subject,
        html,
      }),
    });

    const resData = await res.json();

    if (!res.ok) {
      console.error("Resend error:", resData);
      return new Response(JSON.stringify({ error: "Email send failed", details: resData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
