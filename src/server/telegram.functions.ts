import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  notifyTenantJoined,
  notifyMethodSelected,
  notifyProofUploaded,
} from "@/server/telegram-bot";

const NotifySchema = z.object({
  event: z.enum(["tenant_joined", "method_selected", "proof_uploaded"]),
  tenantName: z.string().min(1).max(200),
  method: z.string().max(50).optional(),
  sessionId: z.string().uuid().optional(),
});

export const sendTelegramAlert = createServerFn({ method: "POST" })
  .inputValidator((input) => NotifySchema.parse(input))
  .handler(async ({ data }) => {
    try {
      if (data.event === "tenant_joined") {
        await notifyTenantJoined(data.tenantName);
      } else if (data.event === "method_selected") {
        if (!data.sessionId) return { ok: false as const, skipped: true };
        await notifyMethodSelected(data.sessionId, data.tenantName, data.method ?? "—");
      } else if (data.event === "proof_uploaded") {
        if (!data.sessionId) return { ok: false as const, skipped: true };
        // Fetch proof_url from DB
        const { data: s } = await supabaseAdmin
          .from("payment_sessions")
          .select("proof_url")
          .eq("id", data.sessionId)
          .maybeSingle();
        if (s?.proof_url) {
          await notifyProofUploaded(data.sessionId, data.tenantName, data.method ?? "—", s.proof_url);
        }
      }
      return { ok: true as const };
    } catch (err) {
      console.error("sendTelegramAlert failed", err);
      return { ok: false as const, error: String(err) };
    }
  });
