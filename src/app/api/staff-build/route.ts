import { staff } from "../../../lib/auth";
import { appBuildId } from "../../../lib/app-build";
import { AppError } from "../../../lib/model";
import { withStaffCookies } from "../../../lib/staff-session";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "CDN-Cache-Control": "no-store",
    "Vercel-CDN-Cache-Control": "no-store",
  };
  try {
    await staff(request);
    return withStaffCookies(
      request,
      Response.json({ buildId: appBuildId }, { headers }),
    );
  } catch (error) {
    const status = error instanceof AppError ? error.status : 503;
    return withStaffCookies(
      request,
      Response.json(
        {
          error:
            status === 401
              ? "Staff authorization required"
              : "Build check unavailable",
        },
        { status, headers },
      ),
    );
  }
}
