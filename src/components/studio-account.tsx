"use client";
import { useState } from "react";
import { Sheet } from "./foundation";
import { ThemeToggle, Button, post } from "./ui";
export function StudioAccount({
  name,
  email,
  onSignout,
  label,
  mark,
}: {
  name: string;
  email?: string;
  onSignout?: () => void;
  label?: string;
  mark?: React.ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return (
    <div className="studio-account">
      <button
        className="studio-account-trigger"
        aria-label={`${label ?? name} · Account menu`}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {mark ?? (
          <span
            className="avatar"
            aria-hidden="true"
            data-initials={name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          />
        )}
        <span>{label ?? name}</span>
      </button>
      {anchor && (
        <Sheet
          title="Account"
          menu
          anchor={anchor}
          onClose={() => setAnchor(null)}
        >
          <div className="studio-account-menu">
            <strong>{name}</strong>
            {email && <small>{email}</small>}
            <ThemeToggle />
            <Button
              variant="ghost"
              onClick={async () => {
                if (onSignout) onSignout();
                else {
                  await post("/api/auth/logout");
                  location.href = "/login";
                }
              }}
            >
              Sign out
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
