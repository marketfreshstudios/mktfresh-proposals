import { randomBytes } from "node:crypto";
import { MCP_SCOPE_LABELS } from "../../../lib/oauth";
import {
  isPlatformHost,
  oauthServer,
  platformOAuthServer,
} from "../../../lib/oauth-runtime";
import {
  REMEMBERED_WORKSPACE_COOKIE,
  requestHost,
  validWorkspaceSlug,
  workspaceSlugFromHost,
} from "../../../lib/workspace-address";
import { workspaceOrigin } from "../../../lib/links";
import { staff, cookie, equalSecret } from "../../../lib/auth";
import { escape } from "../../../lib/content";
import { AppError, check } from "../../../lib/model";
export const dynamic = "force-dynamic";
async function handler(
  req: Request,
  context: { params: Promise<{ action: string }> },
) {
  const s = oauthServer(req),
    action = (await context.params).action;
  try {
    if (action === "register" && req.method === "POST") {
      check(
        Number(req.headers.get("content-length") ?? 0) < 10000,
        "Registration too large",
        413,
      );
      return Response.json(await s.register(await req.json()), {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (action === "token" && req.method === "POST")
      return Response.json(
        await s.exchange(
          Object.fromEntries(new URLSearchParams(await req.text())),
        ),
        { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } },
      );
    // The shared address (app.yeswell.co/mcp): signing in decides the
    // workspace. Send the person to the workspace this browser last used, or
    // to the shared sign-in, which carries them to their own workspace; the
    // connection is approved there (action "connect" below).
    if (action === "authorize" && isPlatformHost(req)) {
      check(req.method === "GET", "Method not allowed", 405);
      const params = Object.fromEntries(new URL(req.url).searchParams);
      await s.validateAuthorization(params);
      const connect = "/oauth/connect?" + new URLSearchParams(params);
      const remembered = cookie(req, REMEMBERED_WORKSPACE_COOKIE);
      return Response.redirect(
        validWorkspaceSlug(remembered ?? "")
          ? workspaceOrigin(remembered!) + connect
          : s.issuer + "/login?next=" + encodeURIComponent(connect),
        303,
      );
    }
    const platform =
      action === "connect" && workspaceSlugFromHost(requestHost(req))
        ? platformOAuthServer()
        : null;
    if (action === "connect" && !platform) throw new AppError(404, "Not found");
    if (action === "authorize" || platform) {
      const s2 = platform ?? s;
      const params =
        req.method === "GET"
          ? Object.fromEntries(new URL(req.url).searchParams)
          : Object.fromEntries(new URLSearchParams(await req.text()));
      const validated = await s2.validateAuthorization(params);
      let actor;
      try {
        actor = await staff(req);
      } catch (e) {
        if (req.method === "GET")
          return Response.redirect(
            new URL(
              "/login?next=" +
                encodeURIComponent(
                  new URL(req.url).pathname + new URL(req.url).search,
                ),
              platform ? new URL(req.url).origin : s.issuer,
            ),
            303,
          );
        throw e;
      }
      if (req.method === "POST") {
        check(
          equalSecret(params.csrf ?? "", cookie(req, "oauth_csrf")),
          "Consent session expired",
          403,
        );
        check(params.decision === "allow", "Consent declined", 403);
        return Response.redirect(await s2.authorize(params, actor), 303);
      }
      const csrf = randomBytes(32).toString("hex");
      // The consent form posts to this page, which then redirects to the client's
      // registered callback. CSP form-action also governs that redirect, so allow
      // exactly the validated callback origin, never a wildcard.
      const callbackOrigin = new URL(params.redirect_uri).origin;
      const hidden = Object.entries({ ...params, csrf })
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`,
        )
        .join("");
      return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect assistant | Yeswell</title><style>body{font:18px system-ui;max-width:560px;margin:10vh auto;padding:24px;color:#202820;background:#f7f8f4}button,a{display:inline-block;padding:16px;margin:8px 8px 0 0}button{background:#13303A;color:white;border:0;border-radius:8px}</style><main><p><strong>Yeswell</strong></p><h1>Connect ${escape(validated.client.data.client_name)}</h1><p>Connect your Yeswell workspace. This assistant can use only the access you approve below. It cannot send proposals, sign, change billing or change settings.</p><ul>${validated.scopes.map((scope) => `<li>${escape(MCP_SCOPE_LABELS[scope] ?? scope)}</li>`).join("")}</ul><p>Requested access: ${escape(validated.scopes.join(", "))}</p>${platform ? `<p>Signed in to <strong>${escape(requestHost(req))}</strong>. Not the right workspace? <a style="padding:0;margin:0" href="${escape(platform.issuer + "/login?next=" + encodeURIComponent(new URL(req.url).pathname + new URL(req.url).search))}">Sign in with a different account</a>.</p>` : ""}<form method="post">${hidden}<button name="decision" value="allow">Allow access</button><a href="/settings/ai">Cancel</a></form></main></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${callbackOrigin}; frame-ancestors 'none'`,
            "Set-Cookie": `oauth_csrf=${csrf}; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=600${s2.issuer.startsWith("https:") ? "; Secure" : ""}`,
          },
        },
      );
    }
    if (action === "revoke" && req.method === "POST") {
      const params = Object.fromEntries(new URLSearchParams(await req.text()));
      const row = await s.store.find(
        (await import("../../../lib/content")).sha256(params.token ?? ""),
        params.token_type_hint === "refresh_token",
      );
      if (row?.kind === "token" && row.data.client_id === params.client_id)
        await s.revoke(row.data.grant_id, row.workspace_id);
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 405 });
  } catch (e) {
    return Response.json(
      {
        error: "invalid_request",
        error_description:
          e instanceof Error ? e.message : "OAuth request failed",
      },
      {
        status: e instanceof AppError ? e.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export { handler as GET, handler as POST };
