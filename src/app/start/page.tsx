import { StartSignup } from "../../components/start-signup";
import { staffMetadata } from "../../lib/staff-brand";
import { signupEnabled } from "../../lib/signup";
import { workspaceDomain } from "../../lib/workspace-address";
export const metadata = staffMetadata("Start your free trial");
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <StartSignup
      enabled={signupEnabled()}
      domain={workspaceDomain() ?? "yeswell.co"}
    />
  );
}
