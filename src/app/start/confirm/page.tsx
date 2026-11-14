import { ConfirmSignup } from "../../../components/start-signup";
import { staffMetadata } from "../../../lib/staff-brand";
export const metadata = staffMetadata("Setting up your workspace");
export default function Page() {
  return <ConfirmSignup />;
}
