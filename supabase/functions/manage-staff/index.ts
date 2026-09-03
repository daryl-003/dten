import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  json,
  requireRole,
  generateTempPassword,
  findAuthUserByEmail,
} from "../_shared/admin-guard.ts";

function generateStaffId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "STAFF-";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

const isEmail = (v: unknown) => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireRole(req, ["admin"]);
  if (guard instanceof Response) return guard;
  const { user, admin } = guard;

  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    switch (action) {
      case "create_staff": {
        const full_name = String(body.full_name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const department = body.department ? String(body.department).trim() : null;
        let password = typeof body.password === "string" ? body.password : "";
        const generated = !password;
        if (generated) password = generateTempPassword();

        if (!full_name) return json({ error: "Full name is required." }, 400);
        if (!isEmail(email)) return json({ error: "Enter a valid email address." }, 400);
        if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

        // Already a staff member?
        const { data: dupStaff } = await admin
          .from("staff_members").select("staff_id").ilike("email", email).maybeSingle();
        if (dupStaff) {
          return json({ error: `${email} is already a staff member (${dupStaff.staff_id}).` }, 409);
        }

        // Reuse an existing account instead of failing with "user already registered".
        let userId: string | null = null;
        let reused = false;
        const existing = await findAuthUserByEmail(admin, email);
        if (existing) {
          userId = existing.id;
          reused = true;
          await admin.auth.admin.updateUserById(userId, { password, email_confirm: true });
        } else {
          const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: full_name },
          });
          if (createErr || !newUser?.user) {
            return json({ error: createErr?.message || "Could not create the staff account." }, 400);
          }
          userId = newUser.user.id;
        }

        // Ensure a profile row exists (the signup trigger only fires on fresh signups).
        const { data: profile } = await admin
          .from("profiles").select("id").eq("user_id", userId).maybeSingle();
        if (!profile) {
          await admin.from("profiles").insert({
            user_id: userId,
            email,
            display_name: full_name,
            must_change_password: true,
          });
        } else {
          await admin.from("profiles").update({ must_change_password: true }).eq("user_id", userId);
        }

        const staffId = generateStaffId();
        const { error: staffErr } = await admin.from("staff_members").insert({
          staff_id: staffId,
          user_id: userId,
          full_name,
          email,
          department,
          created_by: user.id,
        });
        if (staffErr) {
          if (!reused) await admin.auth.admin.deleteUser(userId!);
          return json({ error: `Could not save the staff record: ${staffErr.message}` }, 400);
        }

        const { data: hasRole } = await admin
          .from("user_roles").select("id").eq("user_id", userId).eq("role", "staff").maybeSingle();
        if (!hasRole) {
          const { error: roleErr } = await admin
            .from("user_roles").insert({ user_id: userId, role: "staff" });
          if (roleErr) {
            await admin.from("staff_members").delete().eq("staff_id", staffId);
            if (!reused) await admin.auth.admin.deleteUser(userId!);
            return json({ error: `Could not assign the staff role: ${roleErr.message}` }, 400);
          }
        }

        return json({
          staff_id: staffId,
          email,
          full_name,
          reused_existing_account: reused,
          temporary_password: generated ? password : undefined,
        });
      }

      case "reset_staff_password": {
        const staff_id = String(body.staff_id ?? "");
        const { data: staff } = await admin
          .from("staff_members").select("user_id, email").eq("staff_id", staff_id).maybeSingle();
        if (!staff?.user_id) return json({ error: "Staff member not found." }, 404);
        const password = generateTempPassword();
        const { error } = await admin.auth.admin.updateUserById(staff.user_id, { password });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ must_change_password: true }).eq("user_id", staff.user_id);
        return json({ success: true, email: staff.email, temporary_password: password });
      }

      case "remove_staff": {
        const staff_id = String(body.staff_id ?? "");
        const { data: staff } = await admin
          .from("staff_members").select("*").eq("staff_id", staff_id).maybeSingle();
        if (!staff) return json({ error: "Staff member not found." }, 404);

        if (staff.user_id) {
          await admin.from("user_roles").delete().eq("user_id", staff.user_id).eq("role", "staff");
          await admin.auth.admin.deleteUser(staff.user_id);
        }
        await admin.from("staff_members").delete().eq("staff_id", staff_id);
        return json({ success: true });
      }

      case "set_staff_status": {
        const staff_id = String(body.staff_id ?? "");
        const status = String(body.status ?? "");
        if (!["active", "inactive"].includes(status)) return json({ error: "Invalid status." }, 400);
        const { data: staff } = await admin
          .from("staff_members").select("*").eq("staff_id", staff_id).maybeSingle();
        if (!staff) return json({ error: "Staff member not found." }, 404);

        await admin.from("staff_members").update({ status }).eq("staff_id", staff_id);

        if (staff.user_id) {
          if (status === "inactive") {
            await admin.from("user_roles").delete().eq("user_id", staff.user_id).eq("role", "staff");
          } else {
            const { data: existing } = await admin
              .from("user_roles").select("id")
              .eq("user_id", staff.user_id).eq("role", "staff").maybeSingle();
            if (!existing) {
              await admin.from("user_roles").insert({ user_id: staff.user_id, role: "staff" });
            }
          }
        }
        return json({ success: true });
      }

      case "list_staff": {
        const { data, error } = await admin
          .from("staff_members").select("*").order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 400);
        return json(data || []);
      }

      case "create_admin": {
        const adminEmail = String(body.email ?? "").trim().toLowerCase();
        if (!isEmail(adminEmail)) return json({ error: "Enter a valid email address." }, 400);

        const target = await findAuthUserByEmail(admin, adminEmail);
        if (!target) return json({ error: "No account with that email. They must register first." }, 404);

        const { data: existing } = await admin
          .from("user_roles").select("id").eq("user_id", target.id).eq("role", "admin").maybeSingle();
        if (existing) return json({ error: "That user is already an admin." }, 409);

        const { error } = await admin.from("user_roles").insert({ user_id: target.id, role: "admin" });
        if (error) return json({ error: error.message }, 400);
        return json({ success: true, email: adminEmail });
      }

      case "remove_admin": {
        const targetUserId = String(body.user_id ?? "");
        const { data: targetProfile } = await admin
          .from("profiles").select("email").eq("user_id", targetUserId).maybeSingle();
        if (targetProfile?.email === "darrylshub@gmail.com") {
          return json({ error: "Cannot remove the main administrator." }, 400);
        }
        await admin.from("user_roles").delete().eq("user_id", targetUserId).eq("role", "admin");
        return json({ success: true });
      }

      case "list_admins": {
        const { data: adminRoles } = await admin
          .from("user_roles").select("user_id").eq("role", "admin");
        if (!adminRoles?.length) return json([]);

        const userIds = adminRoles.map((r: { user_id: string }) => r.user_id);
        const { data: profiles } = await admin
          .from("profiles").select("user_id, email, display_name").in("user_id", userIds);

        return json((profiles || []).map((p: { user_id: string; email: string; display_name: string }) => ({
          user_id: p.user_id,
          email: p.email,
          display_name: p.display_name,
          is_main: p.email === "darrylshub@gmail.com",
        })));
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (err) {
    console.error("manage-staff error:", err);
    return json({ error: (err as Error).message || "Unexpected server error." }, 500);
  }
});
