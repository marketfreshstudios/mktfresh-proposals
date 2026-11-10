import type { ReactNode } from "react";

/** A page section on the staff canvas. Headings inside surfaces use t-card-title. */
export function StaffSectionHeading({
  children,
  id,
  action,
  description,
}: {
  children: ReactNode;
  id?: string;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className="staff-section-heading">
      <div>
        <h2 id={id}>{children}</h2>
        {description}
      </div>
      {action}
    </header>
  );
}
