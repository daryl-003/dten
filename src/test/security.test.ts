import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

/**
 * Security regression suite.
 * Runs on every build (see the `prebuild` script) and guards the invariants we
 * hardened: no anonymous access to private tables, no unauthenticated access to
 * privileged edge functions, and signed-URL issuance limited to owners/staff.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Optional tokens let CI extend the suite to authenticated boundaries.
const STUDENT_TOKEN = import.meta.env.VITE_TEST_STUDENT_TOKEN as string | undefined;

const configured = Boolean(URL && KEY);
const d = configured ? describe : describe.skip;

const anon = configured
  ? createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as never);

async function callFunction(name: string, body: unknown, token?: string) {
  return fetch(`${URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY!,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

d("RLS: private tables are not readable anonymously", () => {
  const privateTables = [
    "enrollments",
    "certificates",
    "course_progress",
    "internship_offers",
    "task_submissions",
    "admin_notifications",
    "profiles",
    "user_roles",
    "staff_members",
    "contact_submissions",
    "booking_submissions",
    "newsletter_subscribers",
    "internship_applications",
    "jael_feedback",
    "lesson_progress",
    "quiz_attempts",
    "rate_limits",
  ] as const;

  for (const table of privateTables) {
    it(`${table} returns no rows to anonymous callers`, async () => {
      const { data, error } = await anon.from(table as never).select("*").limit(1);
      // Either the API refuses outright, or RLS filters everything out.
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    });
  }
});

d("RLS: anonymous writes to privileged tables are rejected", () => {
  it("cannot insert admin notifications", async () => {
    const { error } = await anon.from("admin_notifications").insert({
      type: "contact",
      title: "regression",
      message: "regression",
    });
    expect(error).not.toBeNull();
  });

  it("cannot grant itself a role", async () => {
    const { error } = await anon.from("user_roles").insert({
      user_id: "00000000-0000-0000-0000-000000000000",
      role: "admin",
    });
    expect(error).not.toBeNull();
  });

  it("cannot call the role helper anonymously", async () => {
    const { data, error } = await anon.rpc("has_role" as never, {
      _user_id: "00000000-0000-0000-0000-000000000000",
      _role: "admin",
    } as never);
    expect(error !== null || data === false).toBe(true);
  });

  it("cannot call the rate-limit helper", async () => {
    const { error } = await anon.rpc("bump_rate_limit" as never, {
      _key: "regression",
      _window_seconds: 60,
      _limit: 1,
    } as never);
    expect(error).not.toBeNull();
  });
});

d("Edge functions reject unauthenticated callers", () => {
  const guarded = [
    ["admin-data", { table: "enrollments" }],
    ["blog-admin", { action: "list" }],
    ["manage-staff", { action: "list" }],
    ["manage-students", { action: "set_status", enrollment_id: "DTEN-0000", status: "Inactive" }],
    ["get-signed-url", { bucket: "task-submissions", path: "x/y.pdf" }],
    ["ai-feedback", { task_title: "x", course: "y", student_name: "z" }],
  ] as const;

  for (const [name, body] of guarded) {
    it(`${name} responds 401 without a token`, async () => {
      const res = await callFunction(name, body);
      const text = await res.text();
      expect(text.length).toBeGreaterThanOrEqual(0);
      expect([401, 403]).toContain(res.status);
    });
  }
});

d("get-signed-url only issues URLs to owners or staff/admins", () => {
  it("rejects unknown buckets", async () => {
    const res = await callFunction("get-signed-url", { bucket: "secrets", path: "a" }, STUDENT_TOKEN);
    await res.text();
    expect([400, 401, 403]).toContain(res.status);
  });

  it("rejects missing parameters", async () => {
    const res = await callFunction("get-signed-url", {}, STUDENT_TOKEN);
    await res.text();
    expect([400, 401]).toContain(res.status);
  });

  it("never returns a signed URL without a session", async () => {
    const res = await callFunction("get-signed-url", {
      bucket: "task-submissions",
      path: "DTEN-0001/other-student.pdf",
    });
    const text = await res.text();
    expect(res.status).toBe(401);
    expect(text).not.toContain("signedUrl");
  });

  it.skipIf(!STUDENT_TOKEN)(
    "denies a signed-in student a file they do not own",
    async () => {
      const res = await callFunction(
        "get-signed-url",
        { bucket: "task-submissions", path: "DTEN-NOT-MINE/secret.pdf" },
        STUDENT_TOKEN,
      );
      const text = await res.text();
      expect(res.status).toBe(403);
      expect(text).not.toContain("signedUrl");
    },
  );
});

d("Public notification endpoint refuses privileged notification types", () => {
  it("rejects staff-only notification types anonymously", async () => {
    const res = await callFunction("send-notification", {
      type: "task_assigned",
      data: { student_name: "x", course: "y", task_title: "z" },
    });
    await res.text();
    expect([401, 429]).toContain(res.status);
  });

  it("rejects unknown notification types", async () => {
    const res = await callFunction("send-notification", { type: "nope", data: {} });
    await res.text();
    expect([400, 429]).toContain(res.status);
  });
});
