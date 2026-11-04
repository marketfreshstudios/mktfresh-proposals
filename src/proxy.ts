import { NextRequest, NextResponse } from "next/server";
import { staffRequestHeaders, withStaffCookies } from "./lib/staff-session";
import { AppError } from "./lib/model";
import { staff } from "./lib/auth";
export async function proxy(request: NextRequest) {
  try {
    await staff(request);
    return withStaffCookies(
      request,
      NextResponse.next({ request: { headers: staffRequestHeaders(request) } }),
    );
  } catch (error) {
    const status = error instanceof AppError ? error.status : 503;
    return withStaffCookies(
      request,
      NextResponse.json(
        {
          ...(status === 401 ? { code: "STAFF_SIGNED_OUT" } : {}),
          error:
            status === 401
              ? "Staff authorization required"
              : status === 403
                ? (error as AppError).message
                : "Sign-in service unavailable. Try again.",
        },
        { status, headers: { "Cache-Control": "no-store" } },
      ),
    );
  }
}
export const config = {
  matcher: [
    "/api/proposals/:path*",
    "/api/clients/:path*",
    "/api/pricing_items/:path*",
    "/api/templates/:path*",
    "/api/content_library/:path*",
  ],
};
