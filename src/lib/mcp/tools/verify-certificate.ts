import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callerClient, unauthorized } from "../supabase";

export default defineTool({
  name: "verify_certificate",
  title: "Verify certificate",
  description:
    "Verify a DTEN certificate by enrollment ID (starts with DTEN-). Requires sign-in. Returns only a validity result and the course/type unless the certificate belongs to the signed-in account.",
  inputSchema: { enrollment_id: z.string().min(3).describe("Enrollment ID, e.g. DTEN-XXXX.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ enrollment_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const userId = ctx.getUserId();
    if (!userId) return unauthorized();

    const supabase = callerClient(ctx);
    const { data, error } = await supabase
      .from("certificates")
      .select("enrollment_id,student_name,course,type,issued_date,issued_by,description")
      .eq("enrollment_id", enrollment_id);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    if (!data || data.length === 0) {
      return {
        content: [{ type: "text", text: `No certificate found for ${enrollment_id}.` }],
        structuredContent: { valid: false, certificates: [] },
      };
    }

    // Ownership check: only the enrolled student (or an admin) may see identifying details.
    const [{ data: ownEnrollment }, { data: isAdmin }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("enrollment_id")
        .eq("enrollment_id", enrollment_id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);

    const privileged = Boolean(ownEnrollment) || isAdmin === true;

    if (!privileged) {
      // Non-identifying result only: no student_name, issued_by or description.
      const redacted = data.map((c) => ({ course: c.course, type: c.type }));
      return {
        content: [
          {
            type: "text",
            text: `Certificate for ${enrollment_id} is valid. Details are hidden because this certificate does not belong to your account.\n${JSON.stringify(redacted, null, 2)}`,
          },
        ],
        structuredContent: { valid: true, redacted: true, certificates: redacted },
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { valid: true, redacted: false, certificates: data },
    };
  },
});
