import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { verifyAdminPassword } from "@/server/admin.functions";
import { setAdminToken, isAdmin } from "@/lib/admin-session";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, Shield, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Landlord login — RentPay" },
      { name: "description", content: "Secure landlord access to the RentPay coordination dashboard." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdmin()) {
      navigate({ to: "/admin/dashboard" });
    }
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setSubmitting(true);
    try {
      const res = await verifyAdminPassword({ data: { password } });
      if (res.ok && res.token) {
        setAdminToken(res.token);
        toast.success("Welcome back.");
        navigate({ to: "/admin/dashboard" });
      } else {
        toast.error(res.error ?? "Login failed.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster richColors position="top-center" />
      <header className="border-b border-border">
        <div className="mx-auto max-w-xl flex items-center justify-between px-4 h-14">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <span className="text-xs text-muted-foreground">Landlord access</span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm bg-gradient-card shadow-elevated p-7">
          <div className="flex flex-col items-center text-center">
            <div className="size-12 rounded-2xl bg-gradient-hero shadow-glow flex items-center justify-center text-primary-foreground">
              <Shield className="size-6" />
            </div>
            <h1 className="text-xl font-semibold mt-4">Landlord login</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter the shared admin password to continue.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full h-11" disabled={submitting || !password}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
