// Admin access is now open — no password required.
// These helpers are kept as no-ops so existing imports keep working.

export function getAdminToken(): string | null {
  return "open";
}

export function setAdminToken(_token: string) {
  // no-op
}

export function clearAdminToken() {
  // no-op
}

export function isAdmin(): boolean {
  return true;
}
