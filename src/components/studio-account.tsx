"use client";
import { useState } from "react";
import { Sheet } from "./foundation";
import { post } from "./ui";
import { useStaffAccount } from "./staff-account-context";
import { staffInitials, themes } from "../lib/staff-account-model";
import { Bell, LogOut, UserRound } from "lucide-react";

export function StaffThemeOptions({ menu = false }: { menu?: boolean }) {
  const account = useStaffAccount();
  return (
    <div className="account-segment" role="group" aria-label="Theme">
      {themes.map((theme) => (
        <button
          key={theme}
          type="button"
          aria-label={
            theme === "system"
              ? menu
                ? "Auto"
                : "System"
              : `${theme === "dark" ? "Dark" : "Light"} mode`
          }
          aria-pressed={account?.theme === theme}
          onClick={() => void account?.setTheme(theme)}
        >
          {theme === "system"
            ? menu
              ? "Auto"
              : "System"
            : theme === "dark"
              ? "Dark"
              : "Light"}
        </button>
      ))}
    </div>
  );
}
export function StudioAccount({
  name,
  email,
  onSignout,
  label,
  mark,
  role,
}: {
  name: string;
  email?: string;
  onSignout?: () => void;
  label?: string;
  mark?: React.ReactNode;
  role?: "owner" | "member";
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const photo = useStaffAccount()?.account?.photo_url;
  const roleName =
    role === "owner" ? "Super admin" : role === "member" ? "Staff" : undefined;
  const avatar = (
    <span
      className="avatar account-avatar"
      data-initials={photo ? undefined : staffInitials(name)}
      aria-hidden="true"
    >
      {photo && <img src={photo} alt="" />}
    </span>
  );
  return (
    <div className="studio-account">
      <button
        className="studio-account-trigger"
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {mark ?? avatar}
        <span className="account-trigger-label">
          <strong>{label ?? name}</strong>{" "}
          {!label && roleName && <small>{roleName}</small>}
          <span className="sr-only">
            {label === "Account" ? " menu" : " Account menu"}
          </span>
        </span>
      </button>
      {anchor && (
        <Sheet
          title="Account"
          menu
          anchor={anchor}
          onClose={() => setAnchor(null)}
        >
          <div className="studio-account-menu account-menu-r22">
            <div className="account-menu-identity">
              {avatar}
              <span>
                <strong>{name}</strong>
                {email && <small>{email}</small>}
              </span>
              {roleName && <span className="pill">{roleName}</span>}
            </div>
            <a href="/account">
              <UserRound size={16} aria-hidden="true" /> Your account
            </a>
            <a href="/account/notifications">
              <Bell size={16} aria-hidden="true" /> Notifications
            </a>
            <div className="account-menu-theme">
              <span>Theme</span>
              <StaffThemeOptions menu />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (onSignout) onSignout();
                else {
                  await post("/api/auth/logout");
                  location.href = "/login";
                }
              }}
            >
              <LogOut size={16} aria-hidden="true" /> Sign out
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
