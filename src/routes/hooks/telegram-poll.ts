import { createFileRoute } from "@tanstack/react-router";
import { runTelegramPoll } from "@/server/telegram-bot";

export const Route = createFileRoute("/hooks/telegram-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization")?.replace("Bearer ", "");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!auth || !expected || auth !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runTelegramPoll();
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("telegram-poll failed", err);
          return new Response(JSON.stringify({ ok: false, error: String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async () => new Response("Telegram poll endpoint. POST only.", { status: 200 }),
    },
  },
});
