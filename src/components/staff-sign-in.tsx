"use client";
export const STAFF_SIGNED_OUT =
  "You've been signed out. Your changes are kept on this device.";
export function staffErrorMessage(
  status: number,
  data: { code?: string; error?: string },
  fallback = "Unable to complete request",
) {
  return status === 401 &&
    (data.code === "STAFF_SIGNED_OUT" ||
      [
        "Staff authorization required",
        "Staff login required",
        "Invalid session",
      ].includes(data.error ?? ""))
    ? STAFF_SIGNED_OUT
    : (data.error ?? fallback);
}
export function openStaffSignIn() {
  window.open("/login?resume=1", "_blank", "noopener");
}
export const isStaffSignedOut = (error: string) => error === STAFF_SIGNED_OUT;
/** A separate tab leaves every open form and the editor's recovery copy intact. */
export function StaffSignIn({ className = "" }: { className?: string }) {
  return (
    <a
      className={`btn primary ${className}`}
      href="/login?resume=1"
      target="_blank"
      rel="noopener"
    >
      Sign in
    </a>
  );
}
