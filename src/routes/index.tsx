import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendTelegramAlert } from "@/server/telegram.functions";
import { PAYMENT_METHODS, getPaymentMethod, type PaymentMethodId } from "@/lib/payment-methods";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Loader2, CheckCircle2, XCircle, Upload, Wifi } from "lucide-react";

type Session = Database["public"]["Tables"]["payment_sessions"]["Row"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pay your rent — RentPay" },
      { name: "description", content: "Send your rent payment with live landlord coordination and proof upload." },
      { property: "og:title", content: "Pay your rent — RentPay" },
      { property: "og:description", content: "Live tenant–landlord payment coordination with proof upload and instant confirmation." },
    ],
  }),
  component: TenantFlow,
});

type Step = "name" | "method" | "waiting_details" | "details_shown" | "uploading" | "awaiting_confirmation" | "confirmed" | "rejected";

function TenantFlow() {
  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [method, setMethod] = useState<PaymentMethodId | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Realtime subscription on the session
  useEffect(() => {
    if (!session?.id) return;
    const channel = supabase
      .channel(`session-${session.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payment_sessions", filter: `id=eq.${session.id}` },
        (payload) => {
          const next = payload.new as Session;
          setSession(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Drive step from session status
  useEffect(() => {
    if (!session) return;
    if (session.status === "awaiting_details") setStep("waiting_details");
    else if (session.status === "awaiting_proof") setStep("details_shown");
    else if (session.status === "awaiting_confirmation") setStep("awaiting_confirmation");
    else if (session.status === "confirmed") setStep("confirmed");
    else if (session.status === "rejected") setStep("rejected");
  }, [session?.status]);

  async function handleStartName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error("Please enter your full name (at least 2 characters).");
      return;
    }
    if (trimmed.length > 100) {
      toast.error("Name is too long.");
      return;
    }
    setName(trimmed);
    setStep("method");
    // Notify landlord that a tenant joined
    sendTelegramAlert({ data: { event: "tenant_joined", tenantName: trimmed } }).catch(() => {});
  }

  async function handleSelectMethod(id: PaymentMethodId) {
    if (submitting) return;
    setSubmitting(true);
    setMethod(id);
    try {
      const { data, error } = await supabase
        .from("payment_sessions")
        .insert({
          tenant_name: name,
          payment_method: id,
          status: "awaiting_details",
        })
        .select()
        .single();
      if (error) throw error;
      setSession(data);
      setStep("waiting_details");
      const m = getPaymentMethod(id);
      sendTelegramAlert({
        data: { event: "method_selected", tenantName: name, method: m?.name ?? id, sessionId: data.id },
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      toast.error("Could not start session. Please try again.");
      setMethod(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be 10 MB or smaller.");
      return;
    }
    const validTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload an image (PNG, JPG, WEBP, GIF) or PDF.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${session.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("payment-proofs").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("payment_sessions")
        .update({ proof_url: pub.publicUrl, status: "awaiting_confirmation" })
        .eq("id", session.id);
      if (updErr) throw updErr;
      const m = getPaymentMethod(session.payment_method);
      sendTelegramAlert({
        data: { event: "proof_uploaded", tenantName: name, method: m?.name ?? session.payment_method, sessionId: session.id },
      }).catch(() => {});
      toast.success("Proof uploaded. Waiting for landlord confirmation.");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <Header />
      <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <Stepper current={step} />
        <div className="mt-6">
          {step === "name" && <NameStep name={name} setName={setName} onSubmit={handleStartName} />}
          {step === "method" && (
            <MethodStep onSelect={handleSelectMethod} submitting={submitting} selected={method} name={name} />
          )}
          {step === "waiting_details" && <WaitingDetailsStep name={name} method={method} />}
          {step === "details_shown" && session && (
            <DetailsStep
              session={session}
              uploading={uploading}
              onPickFile={() => fileRef.current?.click()}
            />
          )}
          {step === "awaiting_confirmation" && session && <AwaitingConfirmationStep session={session} />}
          {step === "confirmed" && session && <ConfirmedStep session={session} />}
          {step === "rejected" && session && <RejectedStep session={session} onRetry={() => {
            setSession(null);
            setMethod(null);
            setStep("method");
          }} />}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleUpload}
        />
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
      <div className="mx-auto max-w-xl flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-gradient-hero shadow-glow flex items-center justify-center text-primary-foreground font-bold">
            R
          </div>
          <span className="font-semibold tracking-tight">RentPay</span>
        </div>
        <span className="text-[11px] text-muted-foreground">Secure · Real-time</span>
      </div>
    </header>
  );
}

const STEP_ORDER: Step[] = [
  "name",
  "method",
  "waiting_details",
  "details_shown",
  "awaiting_confirmation",
  "confirmed",
];

function Stepper({ current }: { current: Step }) {
  const labels = ["Name", "Method", "Wait", "Pay", "Review", "Done"];
  const idx = useMemo(() => {
    if (current === "rejected") return STEP_ORDER.length - 1;
    const i = STEP_ORDER.indexOf(current);
    return i === -1 ? 0 : i;
  }, [current]);
  return (
    <div className="flex items-center gap-1.5">
      {labels.map((label, i) => {
        const active = i <= idx;
        return (
          <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={`h-1.5 w-full rounded-full transition-colors ${
                active ? "bg-primary" : "bg-border"
              }`}
            />
            <span className={`text-[10px] uppercase tracking-wider ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="bg-gradient-card shadow-card border-border p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1.5">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  );
}

function NameStep({ name, setName, onSubmit }: { name: string; setName: (v: string) => void; onSubmit: (e: React.FormEvent) => void }) {
  return (
    <StepCard title="Pay your rent" subtitle="Real-time payment coordination with your landlord.">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Your full name</Label>
          <Input
            id="name"
            placeholder="e.g. Jordan Rivera"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full h-11">
          Continue
        </Button>
      </form>
    </StepCard>
  );
}

function MethodStep({
  onSelect,
  submitting,
  selected,
  name,
}: {
  onSelect: (id: PaymentMethodId) => void;
  submitting: boolean;
  selected: PaymentMethodId | null;
  name: string;
}) {
  return (
    <StepCard title="Choose a payment method" subtitle={`Hi ${name}, how would you like to pay?`}>
      <div className="grid grid-cols-2 gap-3">
        {PAYMENT_METHODS.map((m) => {
          const isSelected = selected === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={submitting}
              onClick={() => onSelect(m.id)}
              className={`group flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all hover:border-primary hover:shadow-card disabled:opacity-60 ${
                isSelected ? "border-primary bg-accent/40" : "border-border bg-surface"
              }`}
            >
              <span className="text-xl">{m.emoji}</span>
              <span className="font-medium text-sm">{m.name}</span>
              <span className="text-[11px] text-muted-foreground">{m.description}</span>
              {isSelected && submitting && (
                <Loader2 className="size-3.5 animate-spin text-primary mt-1" />
              )}
            </button>
          );
        })}
      </div>
    </StepCard>
  );
}

function WaitingDetailsStep({ name, method }: { name: string; method: PaymentMethodId | null }) {
  const m = method ? getPaymentMethod(method) : null;
  return (
    <StepCard title="Waiting for landlord…" subtitle="Your landlord is preparing payment instructions for you.">
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="relative">
          <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="size-7 text-primary animate-spin" />
          </div>
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        </div>
        <div className="text-center text-sm text-muted-foreground">
          <p><span className="text-foreground font-medium">{name}</span> · {m?.name ?? "—"}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs">
            <Wifi className="size-3 text-success" /> Live connection · updates instantly
          </p>
        </div>
      </div>
    </StepCard>
  );
}

function DetailsStep({
  session,
  uploading,
  onPickFile,
}: {
  session: Session;
  uploading: boolean;
  onPickFile: () => void;
}) {
  const m = getPaymentMethod(session.payment_method);
  return (
    <StepCard title="Send your payment" subtitle={`Use ${m?.name ?? session.payment_method} to send the amount below.`}>
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Amount</div>
          <div className="text-3xl font-semibold mt-1">
            {session.amount != null ? `$${Number(session.amount).toFixed(2)}` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Send to ({m?.name})</div>
          <div className="font-mono text-sm mt-1 break-all">{session.account_details ?? "—"}</div>
        </div>
        {session.landlord_note && (
          <div className="rounded-xl border border-border bg-accent/40 p-4">
            <div className="text-xs text-accent-foreground uppercase tracking-wide">Note from landlord</div>
            <div className="text-sm mt-1 whitespace-pre-wrap">{session.landlord_note}</div>
          </div>
        )}
        <div className="pt-2">
          <Button onClick={onPickFile} disabled={uploading} className="w-full h-11">
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="size-4 mr-2" />
                Upload payment proof (image or PDF)
              </>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            Screenshot or PDF receipt · max 10 MB
          </p>
        </div>
      </div>
    </StepCard>
  );
}

function AwaitingConfirmationStep({ session }: { session: Session }) {
  return (
    <StepCard title="Proof received" subtitle="Your landlord is reviewing your payment.">
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Loader2 className="size-7 text-primary animate-spin" />
        </div>
        {session.proof_url && (
          <a
            href={session.proof_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            View uploaded proof
          </a>
        )}
      </div>
    </StepCard>
  );
}

function ConfirmedStep({ session }: { session: Session }) {
  return (
    <StepCard title="Payment confirmed 🎉" subtitle="Your landlord has marked this payment as received.">
      <div className="flex flex-col items-center justify-center py-6 gap-4">
        <div className="size-16 rounded-full bg-success/15 flex items-center justify-center">
          <CheckCircle2 className="size-8 text-success" />
        </div>
        {session.amount != null && (
          <div className="text-sm text-muted-foreground">
            Amount: <span className="text-foreground font-medium">${Number(session.amount).toFixed(2)}</span>
          </div>
        )}
      </div>
    </StepCard>
  );
}

function RejectedStep({ session, onRetry }: { session: Session; onRetry: () => void }) {
  return (
    <StepCard title="Payment not accepted" subtitle="Your landlord couldn't verify this payment.">
      <div className="flex flex-col items-center justify-center py-6 gap-4">
        <div className="size-16 rounded-full bg-destructive/15 flex items-center justify-center">
          <XCircle className="size-8 text-destructive" />
        </div>
        {session.rejection_reason && (
          <div className="text-sm text-muted-foreground text-center max-w-sm">
            “{session.rejection_reason}”
          </div>
        )}
        <Button variant="outline" onClick={onRetry}>
          Start a new payment
        </Button>
      </div>
    </StepCard>
  );
}
