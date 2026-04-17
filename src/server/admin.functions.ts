import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const VerifySchema = z.object({
  password: z.string().min(1).max(200),
});

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((input) => VerifySchema.parse(input))
  .handler(async ({ data }) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return { ok: false, error: "Admin password not configured on server." };
    }
    // constant-time-ish compare
    if (data.password.length !== expected.length) {
      return { ok: false, error: "Invalid password." };
    }
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ data.password.charCodeAt(i);
    }
    if (mismatch !== 0) {
      return { ok: false, error: "Invalid password." };
    }
    return { ok: true, token: btoa(`admin:${Date.now()}`) };
  });
