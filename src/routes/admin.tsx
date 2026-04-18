import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Landlord — RentPay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminRedirect,
});

function AdminRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/admin/dashboard", replace: true });
  }, [navigate]);
  return null;
}
