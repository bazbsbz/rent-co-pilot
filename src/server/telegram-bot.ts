// Server-only Telegram bot helpers (gateway calls + admin command handling).
// NOT a server function file — imported only by other server-only files.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export type TgInlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

function getKeys() {
  const apiKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.TELEGRAM_API_KEY;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!apiKey || !connKey) return null;
  return { apiKey, connKey, chatId };
}

async function tgFetch(path: string, body: unknown) {
  const keys = getKeys();
  if (!keys) throw new Error("telegram_not_configured");
  const res = await fetch(`${GATEWAY_URL}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keys.apiKey}`,
      "X-Connection-Api-Key": keys.connKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`tg_${path}_failed_${res.status}_${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  buttons?: TgInlineButton[][]
) {
  return tgFetch("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  try {
    await tgFetch("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  } catch {
    /* ignore */
  }
}

export async function sendPhotoFromUrl(chatId: number | string, photoUrl: string, caption: string, buttons?: TgInlineButton[][]) {
  return tgFetch("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: "HTML",
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export async function sendDocumentFromUrl(chatId: number | string, docUrl: string, caption: string, buttons?: TgInlineButton[][]) {
  return tgFetch("sendDocument", {
    chat_id: chatId,
    document: docUrl,
    caption,
    parse_mode: "HTML",
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

const safe = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ----- High-level notifications used elsewhere ------------------------------

export async function notifyTenantJoined(tenantName: string) {
  const keys = getKeys();
  if (!keys?.chatId) return;
  await sendMessage(keys.chatId, `🟢 New tenant: <b>${safe(tenantName)}</b> opened the payment page.`).catch(() => {});
}

export async function notifyMethodSelected(sessionId: string, tenantName: string, method: string) {
  const keys = getKeys();
  if (!keys?.chatId) return;
  await sendMessage(
    keys.chatId,
    `💳 <b>${safe(tenantName)}</b> selected <b>${safe(method)}</b>. Tap to send your details.`,
    [[{ text: "📝 Send details", callback_data: `start_details:${sessionId}` }, { text: "ℹ️ Open", callback_data: `open:${sessionId}` }]]
  ).catch(() => {});
}

export async function notifyProofUploaded(sessionId: string, tenantName: string, method: string, proofUrl: string) {
  const keys = getKeys();
  if (!keys?.chatId) return;
  const caption = `📤 <b>${safe(tenantName)}</b> uploaded payment proof via <b>${safe(method)}</b>.`;
  const buttons: TgInlineButton[][] = [
    [
      { text: "✅ Confirm", callback_data: `confirm:${sessionId}` },
      { text: "❌ Reject", callback_data: `reject:${sessionId}` },
    ],
    [{ text: "ℹ️ Details", callback_data: `open:${sessionId}` }],
  ];
  const isPdf = proofUrl.toLowerCase().endsWith(".pdf");
  try {
    if (isPdf) {
      await sendDocumentFromUrl(keys.chatId, proofUrl, caption, buttons);
    } else {
      await sendPhotoFromUrl(keys.chatId, proofUrl, caption, buttons);
    }
  } catch {
    // Fallback: link
    await sendMessage(keys.chatId, `${caption}\n${proofUrl}`, buttons).catch(() => {});
  }
}

// ----- Admin command/callback handling --------------------------------------

function isAuthorized(chatId: number): boolean {
  const allowed = process.env.TELEGRAM_CHAT_ID;
  if (!allowed) return false;
  return String(chatId) === String(allowed);
}

async function getState(chatId: number) {
  const { data } = await supabaseAdmin
    .from("telegram_admin_state")
    .select("*")
    .eq("chat_id", chatId)
    .maybeSingle();
  return data;
}

async function setState(chatId: number, patch: {
  active_session_id?: string | null;
  awaiting?: string | null;
  pending_amount?: number | null;
}) {
  await supabaseAdmin.from("telegram_admin_state").upsert({
    chat_id: chatId,
    active_session_id: patch.active_session_id ?? null,
    awaiting: patch.awaiting ?? null,
    pending_amount: patch.pending_amount ?? null,
  }, { onConflict: "chat_id" });
}

async function clearAwaiting(chatId: number) {
  await supabaseAdmin
    .from("telegram_admin_state")
    .update({ awaiting: null })
    .eq("chat_id", chatId);
}

async function showSession(chatId: number, sessionId: string) {
  const { data: s } = await supabaseAdmin
    .from("payment_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) {
    await sendMessage(chatId, "Session not found.");
    return;
  }
  const lines = [
    `<b>${safe(s.tenant_name)}</b>`,
    `Method: <b>${safe(s.payment_method)}</b>`,
    `Status: <code>${s.status}</code>`,
    s.amount != null ? `Amount: $${Number(s.amount).toFixed(2)}` : null,
    s.account_details ? `Account: <code>${safe(s.account_details)}</code>` : null,
    s.landlord_note ? `Note: ${safe(s.landlord_note)}` : null,
    s.rejection_reason ? `Rejected: ${safe(s.rejection_reason)}` : null,
  ].filter(Boolean).join("\n");

  const buttons: TgInlineButton[][] = [];
  if (s.status === "awaiting_details" || s.status === "awaiting_proof") {
    buttons.push([{ text: "📝 Send details", callback_data: `start_details:${s.id}` }]);
  }
  if (s.proof_url) {
    buttons.push([{ text: "🖼️ View proof", callback_data: `proof:${s.id}` }]);
  }
  if (s.status === "awaiting_confirmation" || s.proof_url) {
    buttons.push([
      { text: "✅ Confirm", callback_data: `confirm:${s.id}` },
      { text: "❌ Reject", callback_data: `reject:${s.id}` },
    ]);
  }
  await sendMessage(chatId, lines, buttons.length ? buttons : undefined);
}

async function listPending(chatId: number) {
  const { data: rows } = await supabaseAdmin
    .from("payment_sessions")
    .select("id, tenant_name, payment_method, status, created_at")
    .in("status", ["awaiting_details", "awaiting_proof", "awaiting_confirmation"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (!rows || rows.length === 0) {
    await sendMessage(chatId, "✨ No pending sessions.");
    return;
  }
  await sendMessage(chatId, `📋 <b>${rows.length}</b> pending session(s):`);
  for (const r of rows) {
    await sendMessage(
      chatId,
      `<b>${safe(r.tenant_name)}</b> · ${safe(r.payment_method)} · <code>${r.status}</code>`,
      [[{ text: "Open", callback_data: `open:${r.id}` }]]
    );
  }
}

const HELP = `🤖 <b>RentPay Admin Bot</b>
/pending — list sessions needing action
/help — this message

You'll get notified automatically when:
• a tenant opens the page
• a tenant picks a method (tap Send details to reply)
• a tenant uploads proof (Confirm or Reject in chat)`;

async function handleCommand(chatId: number, text: string) {
  const cmd = text.trim().toLowerCase().split(/\s+/)[0];
  if (cmd === "/start" || cmd === "/help") {
    await sendMessage(chatId, HELP);
    return;
  }
  if (cmd === "/pending") {
    await listPending(chatId);
    return;
  }
  if (cmd === "/cancel") {
    await setState(chatId, { active_session_id: null, awaiting: null, pending_amount: null });
    await sendMessage(chatId, "Cancelled.");
    return;
  }
  await sendMessage(chatId, "Unknown command. Try /help");
}

async function handleAwaitingReply(chatId: number, text: string) {
  const state = await getState(chatId);
  if (!state || !state.awaiting || !state.active_session_id) return false;

  if (state.awaiting === "amount") {
    const amount = Number(text.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) {
      await sendMessage(chatId, "❌ Invalid amount. Send a number like <code>1500</code> or <code>1500.50</code>.");
      return true;
    }
    await setState(chatId, {
      active_session_id: state.active_session_id,
      awaiting: "account",
      pending_amount: amount,
    });
    await sendMessage(chatId, `Amount set to <b>$${amount.toFixed(2)}</b>.\n\nNow send the <b>account / destination</b> (e.g. $cashtag, email, phone, address).`);
    return true;
  }

  if (state.awaiting === "account") {
    const account = text.trim().slice(0, 500);
    if (!account) {
      await sendMessage(chatId, "❌ Please send the account details.");
      return true;
    }
    const amount = state.pending_amount;
    if (amount == null) {
      await sendMessage(chatId, "Lost the amount — please /cancel and start again.");
      return true;
    }
    const { error } = await supabaseAdmin
      .from("payment_sessions")
      .update({
        amount,
        account_details: account,
        status: "awaiting_proof",
      })
      .eq("id", state.active_session_id);
    await setState(chatId, { active_session_id: null, awaiting: null, pending_amount: null });
    if (error) {
      await sendMessage(chatId, `❌ Failed to save: ${safe(error.message)}`);
    } else {
      await sendMessage(chatId, `✅ Sent to tenant: <b>$${amount.toFixed(2)}</b> → <code>${safe(account)}</code>\n\nWaiting for proof…`);
    }
    return true;
  }

  if (state.awaiting === "reject_reason") {
    const reason = text.trim().slice(0, 300) || null;
    const { error } = await supabaseAdmin
      .from("payment_sessions")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", state.active_session_id);
    await setState(chatId, { active_session_id: null, awaiting: null, pending_amount: null });
    if (error) {
      await sendMessage(chatId, `❌ Failed: ${safe(error.message)}`);
    } else {
      await sendMessage(chatId, `❌ Marked as rejected${reason ? `: ${safe(reason)}` : ""}.`);
    }
    return true;
  }

  return false;
}

async function handleCallback(chatId: number, callbackId: string, data: string) {
  const [action, sessionId] = data.split(":");
  if (!sessionId) {
    await answerCallbackQuery(callbackId, "Bad action");
    return;
  }

  if (action === "open") {
    await answerCallbackQuery(callbackId);
    await showSession(chatId, sessionId);
    return;
  }

  if (action === "start_details") {
    await setState(chatId, { active_session_id: sessionId, awaiting: "amount", pending_amount: null });
    await answerCallbackQuery(callbackId, "Send amount");
    await sendMessage(chatId, "💵 Send the <b>amount in USD</b> (e.g. <code>1500</code>). Send /cancel to abort.");
    return;
  }

  if (action === "confirm") {
    const { error } = await supabaseAdmin
      .from("payment_sessions")
      .update({ status: "confirmed" })
      .eq("id", sessionId);
    await answerCallbackQuery(callbackId, error ? "Failed" : "Confirmed");
    if (!error) await sendMessage(chatId, "✅ Payment confirmed.");
    return;
  }

  if (action === "reject") {
    await setState(chatId, { active_session_id: sessionId, awaiting: "reject_reason", pending_amount: null });
    await answerCallbackQuery(callbackId, "Send reason");
    await sendMessage(chatId, "Send a <b>rejection reason</b> (or send <code>-</code> to skip).");
    return;
  }

  if (action === "proof") {
    const { data: s } = await supabaseAdmin
      .from("payment_sessions")
      .select("proof_url, payment_method, tenant_name")
      .eq("id", sessionId)
      .maybeSingle();
    await answerCallbackQuery(callbackId);
    if (!s?.proof_url) {
      await sendMessage(chatId, "No proof uploaded yet.");
      return;
    }
    const caption = `Proof from <b>${safe(s.tenant_name)}</b> · ${safe(s.payment_method)}`;
    const buttons: TgInlineButton[][] = [[
      { text: "✅ Confirm", callback_data: `confirm:${sessionId}` },
      { text: "❌ Reject", callback_data: `reject:${sessionId}` },
    ]];
    const isPdf = s.proof_url.toLowerCase().endsWith(".pdf");
    if (isPdf) await sendDocumentFromUrl(chatId, s.proof_url, caption, buttons);
    else await sendPhotoFromUrl(chatId, s.proof_url, caption, buttons);
    return;
  }

  await answerCallbackQuery(callbackId, "Unknown");
}

// ----- Polling entry point --------------------------------------------------

const MAX_RUNTIME_MS = 50_000;
const MIN_REMAINING_MS = 5_000;

export async function runTelegramPoll() {
  const keys = getKeys();
  if (!keys) return { ok: false, skipped: true, reason: "no_keys" as const };

  const start = Date.now();
  let processed = 0;

  const { data: state } = await supabaseAdmin
    .from("telegram_bot_state").select("update_offset").eq("id", 1).single();
  let offset = state?.update_offset ?? 0;

  while (true) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - start);
    if (remaining < MIN_REMAINING_MS) break;
    const timeout = Math.min(45, Math.floor(remaining / 1000) - 5);
    if (timeout < 1) break;

    let json: any;
    try {
      json = await tgFetch("getUpdates", {
        offset,
        timeout,
        allowed_updates: ["message", "callback_query"],
      });
    } catch (err) {
      console.error("getUpdates failed", err);
      break;
    }

    const updates: any[] = json.result ?? [];
    if (updates.length === 0) continue;

    for (const u of updates) {
      try {
        if (u.callback_query) {
          const cq = u.callback_query;
          const chatId = cq.message?.chat?.id;
          if (chatId && isAuthorized(chatId)) {
            await handleCallback(chatId, cq.id, cq.data ?? "");
          } else if (chatId) {
            await answerCallbackQuery(cq.id, "Not authorized");
          }
        } else if (u.message) {
          const m = u.message;
          const chatId = m.chat?.id;
          const text: string = m.text ?? "";
          if (!chatId || !isAuthorized(chatId)) {
            if (chatId) await sendMessage(chatId, "🚫 Not authorized.").catch(() => {});
            continue;
          }
          if (text.startsWith("/")) {
            await handleCommand(chatId, text);
          } else if (text) {
            const handled = await handleAwaitingReply(chatId, text);
            if (!handled) await sendMessage(chatId, "Try /help");
          }
        }
      } catch (err) {
        console.error("update handler error", err);
      }
      processed++;
    }

    offset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await supabaseAdmin
      .from("telegram_bot_state")
      .update({ update_offset: offset, updated_at: new Date().toISOString() })
      .eq("id", 1);
  }

  return { ok: true, processed, finalOffset: offset };
}
