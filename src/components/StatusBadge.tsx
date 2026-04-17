import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["payment_status"];

const LABELS: Record<Status, string> = {
  awaiting_details: "Awaiting details",
  awaiting_proof: "Awaiting proof",
  awaiting_confirmation: "Review proof",
  confirmed: "Confirmed",
  rejected: "Rejected",
};

export function StatusBadge({ status }: { status: Status }) {
  const label = LABELS[status];
  let className = "bg-muted text-muted-foreground";
  if (status === "awaiting_details" || status === "awaiting_proof") {
    className = "bg-warning/15 text-warning-foreground border-warning/40";
  } else if (status === "awaiting_confirmation") {
    className = "bg-primary/15 text-primary border-primary/40";
  } else if (status === "confirmed") {
    className = "bg-success/15 text-success border-success/40";
  } else if (status === "rejected") {
    className = "bg-destructive/15 text-destructive border-destructive/40";
  }
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
