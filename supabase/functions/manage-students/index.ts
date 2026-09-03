import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  json,
  requireRole,
  generateTempPassword,
  findAuthUserByEmail,
} from "../_shared/admin-guard.ts";

const isEmail = (v: unknown) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function generateEnrollmentId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "DTEN-";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireRole(req, ["admin"]);
  if (guard instanceof Response) return guard;
  const { admin } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "create_student": {
        const full_name = String(body.full_name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const course = String(body.course ?? "").trim();
        const phone = body.phone ? String(body.phone).trim() : null;
        const withAccount = body.create_account !== false;

        if (!full_name) return json({ error: "Full name is required." }, 400);
        if (!isEmail(email)) return json({ error: "Enter a valid email address." }, 400);
        if (!course) return json({ error: "Course is required." }, 400);

        let userId: string | null = null;
        let tempPassword: string | undefined;

        if (withAccount) {
          const existing = await findAuthUserByEmail(admin, email);
          if (existing) {
            userId = existing.id;
          } else {
            tempPassword = generateTempPassword();
            const { data: created, error: createErr } = await admin.auth.admin.createUser({
              email,
              password: tempPassword,
              email_confirm: true,
              user_metadata: { display_name: full_name },
            });
            if (createErr || !created?.user) {
              return json({ error: createErr?.message || "Could not create the student account." }, 400);
            }
            userId = created.user.id;
            const { data: profile } = await admin
              .from("profiles").select("id").eq("user_id", userId).maybeSingle();
            if (!profile) {
              await admin.from("profiles").insert({
                user_id: userId, email, display_name: full_name, must_change_password: true,
              });
            } else {
              await admin.from("profiles").update({ must_change_password: true }).eq("user_id", userId);
            }
          }
        }

        let enrollmentId = generateEnrollmentId();
        for (let i = 0; i < 5; i++) {
          const { data: clash } = await admin
            .from("enrollments").select("id").eq("enrollment_id", enrollmentId).maybeSingle();
          if (!clash) break;
          enrollmentId = generateEnrollmentId();
        }

        const { data: enrollment, error: enrollErr } = await admin.from("enrollments").insert({
          enrollment_id: enrollmentId,
          full_name,
          email,
          phone,
          course,
          source: "admin",
          status: "Active",
          user_id: userId,
        }).select().single();
        if (enrollErr) return json({ error: `Could not save the enrollment: ${enrollErr.message}` }, 400);

        return json({ success: true, enrollment, temporary_password: tempPassword });
      }

      case "update_student": {
        const enrollment_id = String(body.enrollment_id ?? "");
        if (!enrollment_id) return json({ error: "Enrollment ID is required." }, 400);

        const updates: Record<string, unknown> = {};
        if (body.full_name !== undefined) {
          const v = String(body.full_name).trim();
          if (!v) return json({ error: "Full name cannot be empty." }, 400);
          updates.full_name = v;
        }
        if (body.email !== undefined) {
          const v = String(body.email).trim().toLowerCase();
          if (!isEmail(v)) return json({ error: "Enter a valid email address." }, 400);
          updates.email = v;
        }
        if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).trim() : null;
        if (body.course !== undefined) {
          const v = String(body.course).trim();
          if (!v) return json({ error: "Course cannot be empty." }, 400);
          updates.course = v;
        }
        if (body.status !== undefined) {
          const v = String(body.status);
          if (!["Active", "Inactive", "Completed"].includes(v)) return json({ error: "Invalid status." }, 400);
          updates.status = v;
        }
        if (body.payment_status !== undefined) {
          const v = String(body.payment_status);
          if (!["unpaid", "paid", "pending", "free"].includes(v)) return json({ error: "Invalid payment status." }, 400);
          updates.payment_status = v;
        }
        if (!Object.keys(updates).length) return json({ error: "Nothing to update." }, 400);

        const { data, error } = await admin
          .from("enrollments").update(updates).eq("enrollment_id", enrollment_id).select().maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!data) return json({ error: "Enrollment not found." }, 404);
        return json({ success: true, enrollment: data });
      }

      case "reset_student_password": {
        const enrollment_id = String(body.enrollment_id ?? "");
        const { data: enr } = await admin
          .from("enrollments").select("email, user_id").eq("enrollment_id", enrollment_id).maybeSingle();
        if (!enr) return json({ error: "Enrollment not found." }, 404);

        let userId = enr.user_id as string | null;
        if (!userId) {
          const existing = await findAuthUserByEmail(admin, enr.email);
          userId = existing?.id ?? null;
        }

        const password = generateTempPassword();
        if (!userId) {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email: enr.email,
            password,
            email_confirm: true,
          });
          if (createErr || !created?.user) {
            return json({ error: createErr?.message || "Could not create the student account." }, 400);
          }
          userId = created.user.id;
          await admin.from("enrollments").update({ user_id: userId }).eq("enrollment_id", enrollment_id);
        } else {
          const { error } = await admin.auth.admin.updateUserById(userId, { password });
          if (error) return json({ error: error.message }, 400);
        }
        await admin.from("profiles").update({ must_change_password: true }).eq("user_id", userId);
        return json({ success: true, email: enr.email, temporary_password: password });
      }

      case "set_status": {
        const enrollment_id = String(body.enrollment_id ?? "");
        const status = String(body.status ?? "");
        if (!["Active", "Inactive", "Completed"].includes(status)) return json({ error: "Invalid status." }, 400);
        const { error } = await admin
          .from("enrollments").update({ status }).eq("enrollment_id", enrollment_id);
        if (error) return json({ error: error.message }, 400);
        return json({ success: true });
      }

      case "delete_student": {
        const enrollment_id = String(body.enrollment_id ?? "");
        const { data: enr } = await admin
          .from("enrollments").select("email").eq("enrollment_id", enrollment_id).maybeSingle();
        if (!enr) return json({ error: "Enrollment not found." }, 404);

        await admin.from("task_submissions").delete().eq("enrollment_id", enrollment_id);
        await admin.from("course_progress").delete().eq("enrollment_id", enrollment_id);
        await admin.from("certificates").delete().eq("enrollment_id", enrollment_id);
        await admin.from("internship_offers").delete().eq("enrollment_id", enrollment_id);
        await admin.from("enrollments").delete().eq("enrollment_id", enrollment_id);

        if (body.delete_account) {
          const target = await findAuthUserByEmail(admin, enr.email);
          if (target) await admin.auth.admin.deleteUser(target.id);
        }
        return json({ success: true });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (err) {
    console.error("manage-students error:", err);
    return json({ error: (err as Error).message || "Unexpected server error." }, 500);
  }
});
