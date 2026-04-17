import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NotifySchema = z.object({
  event: z.enum(["tenant_joined", "method_selected", "proof_uploaded"]),
  tenantName: z.string().min(1).max(200),
  method: z.string().max(50).optional(),
  sessionId: z.string().uuid().optional(),
});

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function buildMessage(input: z.infer<typeof NotifySchema>): string {
  const safe = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const name = `<b>${safe(input.tenantName)}</b>`;
  const method = input.method ? ` via <b>${safe(input.method)}</b>` : "";
  switch (input.event) {
    case "tenant_joined":
      return `🟢 New tenant: ${name} just opened the payment page.`;
    case "method_selected":
      return `💳 ${name} selected a payment method${method}. Awaiting your details.`;
    case "proof_uploaded":
      return `📤 ${name} uploaded payment proof${method}. Please review and confirm.`;
  }
}

export const sendTelegramAlert = createServerFn({ method: "POST" })
  .inputValidator((input) => NotifySchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    const connKey = process.env.TELEGRAM_API_KEY;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!apiKey || !connKey) {
      console.warn("Telegram not configured (gateway keys missing). Skipping alert.");
      return { ok: false, skipped: true as const, reason: "missing_keys" };
    }
    if (!chatId) {
      console.warn("TELEGRAM_CHAT_ID not configured. Skipping alert.");
      return { ok: false, skipped: true as const, reason: "missing_chat_id" };
    }

    try {
      const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Connection-Api-Key": connKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: buildMessage(data),
          parse_mode: "HTML",
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        console.error("Telegram send failed", res.status, body);
        return { ok: false, skipped: false as const, error: `Telegram ${res.status}` };
      }
      return { ok: true as const };
    } catch (err) {
      console.error("Telegram fetch error", err);
      return { ok: false, skipped: false as const, error: "network_error" };
    }
  });
