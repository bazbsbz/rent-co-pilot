import { createFileRoute, Outlet, useNavigate, useMatches } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Landlord — RentPay" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const matches = useMatches();
  // If user is exactly on /admin (no child matched), redirect to dashboard.
  const isExactAdmin = matches[matches.length - 1]?.routeId === "/admin";

  useEffect(() => {
    if (isExactAdmin) {
      navigate({ to: "/admin/dashboard", replace: true });
    }
  }, [isExactAdmin, navigate]);

  return <Outlet />;
}
