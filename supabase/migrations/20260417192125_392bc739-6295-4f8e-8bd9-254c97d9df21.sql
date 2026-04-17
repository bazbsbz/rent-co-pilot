-- Status enum
CREATE TYPE public.payment_status AS ENUM (
  'awaiting_details',
  'awaiting_proof',
  'awaiting_confirmation',
  'confirmed',
  'rejected'
);

-- Main table
CREATE TABLE public.payment_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_name TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'awaiting_details',
  amount NUMERIC(10, 2),
  account_details TEXT,
  landlord_note TEXT,
  proof_url TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_sessions_status ON public.payment_sessions(status);
CREATE INDEX idx_payment_sessions_created_at ON public.payment_sessions(created_at DESC);

-- RLS: open for MVP (anonymous tenants + shared-password landlord)
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view payment sessions"
  ON public.payment_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create payment sessions"
  ON public.payment_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update payment sessions"
  ON public.payment_sessions FOR UPDATE
  USING (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_payment_sessions_updated_at
  BEFORE UPDATE ON public.payment_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER TABLE public.payment_sessions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_sessions;

-- Storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true);

CREATE POLICY "Payment proofs are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-proofs');

CREATE POLICY "Anyone can upload payment proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'payment-proofs');