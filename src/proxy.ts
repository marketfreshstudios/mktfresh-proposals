import { NextRequest, NextResponse } from "next/server";
import { staff } from "./lib/auth";
export async function proxy(request: NextRequest) {
  try {
    await staff(request);
    return NextResponse.next();
  } catch {
    return NextResponse.json(
      { error: "Staff authorization required" },
      { status: 401 },
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
