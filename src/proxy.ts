import { NextRequest, NextResponse } from "next/server";
import { staffRequestHeaders, withStaffCookies } from "./lib/staff-session";
import { AppError } from "./lib/model";
import { StaffPasswordRequired } from "./lib/staff-access";
import { cookie, staff } from "./lib/auth";
import {
  priorStaffState,
  staffIdentityCookie,
  staffIdentityCookieName,
  StaffSecurityRequired,
} from "./lib/staff-security-session";
export function staffPagePath(path: string) {
  return (
    !/^\/(?:api|login|set-password|p|oauth|mcp|_next|fonts|brand|schemas|\.well-known)(?:\/|$)/.test(
      path,
    ) &&
    ![
      "/favicon.ico",
      "/favicon.svg",
      "/favicon-32.png",
      "/favicon-16.png",
      "/apple-touch-icon.png",
      "/icon-192.png",
      "/icon-512.png",
      "/manifest.webmanifest",
      "/yeswell-social-1200x630.png",
      "/pdf.worker.min.mjs",
      "/pdfjs-LICENSE.txt",
    ].includes(path)
  );
}
export async function proxy(request: NextRequest) {
  const page = staffPagePath(request.nextUrl.pathname);
  if (!page && !request.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.next();
  try {
    const user = await staff(request);
    const response = NextResponse.next({
      request: { headers: staffRequestHeaders(request) },
    });
    if (page) {
      response.headers.set("Cache-Control", "no-store");
      if (!cookie(request, staffIdentityCookieName)) {
        const hint = staffIdentityCookie(user.actor.slice(6));
        if (hint) response.headers.append("Set-Cookie", hint);
      }
    }
    return withStaffCookies(request, response);
  } catch (error) {
    const status = error instanceof AppError ? error.status : 503;
    if (
      page &&
      (status === 401 ||
        error instanceof StaffPasswordRequired ||
        error instanceof StaffSecurityRequired)
    ) {
      const url = new URL(
        error instanceof StaffPasswordRequired ? "/set-password" : "/login",
        request.url,
      );
      url.searchParams.set(
        "next",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      if (error instanceof StaffSecurityRequired)
        url.searchParams.set("state", error.state);
      else if (status === 401) {
        const prior = await priorStaffState(request).catch(() => null);
        if (
          prior ||
          cookie(request, "proposal_session") ||
          cookie(request, "proposal_refresh")
        )
          url.searchParams.set("state", prior?.state ?? "signed-out");
      }
      const response = NextResponse.redirect(url, 307);
      response.headers.set("Cache-Control", "no-store");
      return withStaffCookies(request, response);
    }
    return withStaffCookies(
      request,
      NextResponse.json(
        {
          ...(status === 401
            ? { code: "STAFF_SIGNED_OUT" }
            : error instanceof StaffPasswordRequired
              ? { code: error.code }
              : {}),
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
    "/((?!api(?:/|$)|login(?:/|$)|set-password(?:/|$)|p(?:/|$)|oauth(?:/|$)|mcp(?:/|$)|\\.well-known(?:/|$)|_next(?:/|$)|fonts(?:/|$)|schemas(?:/|$)|favicon.ico$|pdf.worker.min.mjs$|pdfjs-LICENSE.txt$).*)",
    "/api/proposals/:path*",
    "/api/reports/:path*",
    "/api/clients/:path*",
    "/api/pricing_items/:path*",
    "/api/templates/:path*",
    "/api/content_library/:path*",
  ],
};
