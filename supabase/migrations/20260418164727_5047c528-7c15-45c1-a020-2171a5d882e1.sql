-- Polling offset (singleton row)
CREATE TABLE public.telegram_bot_state (
  id INT PRIMARY KEY CHECK (id = 1),
  update_offset BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;
-- No policies = no public access; service role bypasses RLS.

-- Per-chat conversation state for the admin bot
CREATE TABLE public.telegram_admin_state (
  chat_id BIGINT PRIMARY KEY,
  active_session_id UUID REFERENCES public.payment_sessions(id) ON DELETE SET NULL,
  awaiting TEXT, -- 'amount' | 'account' | 'reject_reason' | null
  pending_amount NUMERIC,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_admin_state ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_telegram_admin_state_updated
  BEFORE UPDATE ON public.telegram_admin_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_telegram_bot_state_updated
  BEFORE UPDATE ON public.telegram_bot_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();