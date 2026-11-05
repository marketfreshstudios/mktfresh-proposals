import { SetStaffPassword } from "../../components/set-staff-password";
import { staffMetadata } from "../../lib/staff-brand";
export const metadata = staffMetadata("Set your password");
export default function Page() {
  return <SetStaffPassword />;
}
