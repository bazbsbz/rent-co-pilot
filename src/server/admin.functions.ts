import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const VerifySchema = z.object({
  password: z.string().min(1).max(200),
});

export const verifyAdminPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => VerifySchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const expected = process.env.ADMIN_PASSWORD;
      if (!expected || typeof expected !== "string" || expected.length === 0) {
        return { ok: false as const, error: "Admin password not configured on server." };
      }

      // constant-time-ish compare
      let mismatch = data.password.length === expected.length ? 0 : 1;
      const len = Math.max(expected.length, data.password.length);
      for (let i = 0; i < len; i++) {
        const a = i < expected.length ? expected.charCodeAt(i) : 0;
        const b = i < data.password.length ? data.password.charCodeAt(i) : 0;
        mismatch |= a ^ b;
      }
      if (mismatch !== 0) {
        return { ok: false as const, error: "Invalid password." };
      }

      // Generate a simple token without relying on btoa (use Buffer for Worker compat)
      const raw = `admin:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const token =
        typeof Buffer !== "undefined"
          ? Buffer.from(raw).toString("base64")
          : raw;

      return { ok: true as const, token };
    } catch (err) {
      console.error("verifyAdminPassword error:", err);
      return { ok: false as const, error: "Server error verifying password." };
    }
  });
