import { staffInitials } from "../lib/staff-account-model";

/** A staff member's photo (or initials) beside their name. Owner 10 Nov:
 * the profile photo shows wherever a staff name is listed. */
export function StaffPerson({
  name,
  photo,
  className = "",
}: {
  name: string;
  photo?: string | null;
  className?: string;
}) {
  return (
    <span className={`staff-person ${className}`}>
      <span
        className="avatar staff-person-avatar"
        data-initials={photo ? undefined : staffInitials(name)}
        aria-hidden="true"
      >
        {photo && <img src={photo} alt="" />}
      </span>
      <span className="staff-person-name">{name}</span>
    </span>
  );
}
