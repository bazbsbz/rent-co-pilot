import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isAdmin, clearAdminToken } from "@/lib/admin-session";
import type { Database } from "@/integrations/supabase/types";
import { getPaymentMethod } from "@/lib/payment-methods";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { LogOut, Inbox, Loader2, CheckCircle2, XCircle, ExternalLink, Wifi } from "lucide-react";

type Session = Database["public"]["Tables"]["payment_sessions"]["Row"];

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Landlord dashboard — RentPay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin()) {
      navigate({ to: "/admin" });
      return;
    }
    setAuthed(true);
  }, [navigate]);

  useEffect(() => {
    if (!authed) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("payment_sessions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!mounted) return;
      if (error) {
        toast.error("Failed to load sessions.");
        console.error(error);
      } else if (data) {
        setSessions(data);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel("admin-sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_sessions" },
        (payload) => {
          setSessions((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as Session;
              return [row, ...prev.filter((s) => s.id !== row.id)];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as Session;
              return prev.map((s) => (s.id === row.id ? row : s));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as Session;
              return prev.filter((s) => s.id !== row.id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [authed]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  function handleLogout() {
    clearAdminToken();
    navigate({ to: "/admin" });
  }

  if (!authed) return null;

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-gradient-hero shadow-glow flex items-center justify-center text-primary-foreground font-bold">
              R
            </div>
            <div>
              <div className="font-semibold tracking-tight text-sm">RentPay · Landlord</div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Wifi className="size-3 text-success" /> Live
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              Tenant view
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="size-4 mr-1" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 grid gap-6 lg:grid-cols-[360px_1fr]">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Sessions
            </h2>
            <span className="text-xs text-muted-foreground">{sessions.length}</span>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <Card className="p-8 text-center bg-surface border-dashed">
              <Inbox className="size-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-3">
                No tenant sessions yet. Share your RentPay link with a tenant to begin.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  active={s.id === selectedId}
                  onClick={() => setSelectedId(s.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          {selected ? (
            <SessionDetail session={selected} />
          ) : (
            <Card className="p-12 bg-surface border-dashed text-center">
              <p className="text-sm text-muted-foreground">
                Select a session on the left to view details and respond.
              </p>
            </Card>
          )}
        </section>
      </main>
    </div>
  );
}

function SessionItem({ session, active, onClick }: { session: Session; active: boolean; onClick: () => void }) {
  const m = getPaymentMethod(session.payment_method);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-all ${
        active
          ? "border-primary bg-accent/40 shadow-card"
          : "border-border bg-surface hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{session.tenant_name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {m?.emoji} {m?.name ?? session.payment_method}
            {session.amount != null && ` · $${Number(session.amount).toFixed(2)}`}
          </div>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <div className="text-[11px] text-muted-foreground mt-2">
        {new Date(session.created_at).toLocaleString()}
      </div>
    </button>
  );
}

function SessionDetail({ session }: { session: Session }) {
  const m = getPaymentMethod(session.payment_method);
  const [amount, setAmount] = useState<string>(session.amount != null ? String(session.amount) : "");
  const [account, setAccount] = useState<string>(session.account_details ?? "");
  const [note, setNote] = useState<string>(session.landlord_note ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset local form when switching sessions
  useEffect(() => {
    setAmount(session.amount != null ? String(session.amount) : "");
    setAccount(session.account_details ?? "");
    setNote(session.landlord_note ?? "");
    setReason("");
  }, [session.id]);

  async function sendDetails() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 99999999) {
      toast.error("Enter a valid amount.");
      return;
    }
    if (!account.trim() || account.length > 500) {
      toast.error("Enter the account/destination details.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("payment_sessions")
      .update({
        amount: parsed,
        account_details: account.trim(),
        landlord_note: note.trim() || null,
        status: "awaiting_proof",
      })
      .eq("id", session.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to send details.");
      console.error(error);
    } else {
      toast.success("Details sent to tenant.");
    }
  }

  async function approve() {
    setSaving(true);
    const { error } = await supabase
      .from("payment_sessions")
      .update({ status: "confirmed" })
      .eq("id", session.id);
    setSaving(false);
    if (error) toast.error("Could not confirm.");
    else toast.success("Payment confirmed.");
  }

  async function reject() {
    setSaving(true);
    const { error } = await supabase
      .from("payment_sessions")
      .update({ status: "rejected", rejection_reason: reason.trim() || null })
      .eq("id", session.id);
    setSaving(false);
    if (error) toast.error("Could not reject.");
    else toast.success("Marked as rejected.");
  }

  const canEditDetails = session.status === "awaiting_details" || session.status === "awaiting_proof";
  const canDecide = session.status === "awaiting_confirmation";

  return (
    <Card className="bg-gradient-card shadow-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{session.tenant_name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {m?.emoji} {m?.name ?? session.payment_method} ·{" "}
            {new Date(session.created_at).toLocaleString()}
          </p>
        </div>
        <StatusBadge status={session.status} />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0"
            placeholder="1500.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={!canEditDetails}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account">Send-to ({m?.name})</Label>
          <Input
            id="account"
            placeholder="$cashtag, email, phone, address…"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            maxLength={500}
            disabled={!canEditDetails}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea
            id="note"
            placeholder="Any extra instructions for the tenant…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            disabled={!canEditDetails}
            rows={3}
          />
        </div>
      </div>

      {canEditDetails && (
        <Button onClick={sendDetails} disabled={saving} className="mt-4 w-full sm:w-auto">
          {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
          {session.status === "awaiting_details" ? "Send details to tenant" : "Update details"}
        </Button>
      )}

      {(session.status === "awaiting_proof" || session.status === "awaiting_confirmation" || session.proof_url) && (
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Payment proof
          </h3>
          {session.proof_url ? (
            <ProofPreview url={session.proof_url} />
          ) : (
            <p className="text-sm text-muted-foreground">Waiting for tenant to upload proof…</p>
          )}
        </div>
      )}

      {canDecide && (
        <div className="mt-6 border-t border-border pt-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Verify payment
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={approve} disabled={saving} className="bg-success text-success-foreground hover:bg-success/90 h-11">
              <CheckCircle2 className="size-4 mr-2" /> Confirm payment
            </Button>
            <Button onClick={reject} disabled={saving} variant="destructive" className="h-11">
              <XCircle className="size-4 mr-2" /> Reject
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional, shown to tenant on reject)</Label>
            <Input
              id="reason"
              placeholder="e.g. Amount didn't match"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </div>
        </div>
      )}

      {session.status === "rejected" && session.rejection_reason && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <span className="font-medium text-destructive">Rejection reason: </span>
          {session.rejection_reason}
        </div>
      )}
    </Card>
  );
}

function ProofPreview({ url }: { url: string }) {
  const isPdf = url.toLowerCase().endsWith(".pdf");
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
      >
        Open in new tab <ExternalLink className="size-3" />
      </a>
      {isPdf ? (
        <iframe src={url} title="Payment proof" className="w-full h-96 rounded-lg border border-border bg-surface" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt="Payment proof"
            className="max-h-[28rem] w-auto rounded-lg border border-border bg-surface object-contain"
          />
        </a>
      )}
    </div>
  );
}
