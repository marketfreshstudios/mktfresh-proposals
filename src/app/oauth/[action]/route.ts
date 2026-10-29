import { randomBytes } from "node:crypto";
import { oauthServer } from "../../../lib/oauth-runtime";
import { staff, cookie, equalSecret } from "../../../lib/auth";
import { escape } from "../../../lib/content";
import { AppError, check } from "../../../lib/model";
export const dynamic = "force-dynamic";
async function handler(
  req: Request,
  context: { params: Promise<{ action: string }> },
) {
  const s = oauthServer(),
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
    if (action === "authorize") {
      const params =
        req.method === "GET"
          ? Object.fromEntries(new URL(req.url).searchParams)
          : Object.fromEntries(new URLSearchParams(await req.text()));
      const validated = await s.validateAuthorization(params);
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
              s.issuer,
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
        return Response.redirect(await s.authorize(params, actor), 303);
      }
      const csrf = randomBytes(32).toString("hex");
      const hidden = Object.entries({ ...params, csrf })
        .map(
          ([k, v]) =>
            `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`,
        )
        .join("");
      return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect assistant</title><style>body{font:18px system-ui;max-width:560px;margin:10vh auto;padding:24px;color:#202820;background:#f7f8f4}button,a{display:inline-block;padding:16px;margin:8px 8px 0 0}button{background:#365c4a;color:white;border:0;border-radius:8px}</style><main><h1>Connect ${escape(validated.client.data.client_name)}</h1><p>This assistant can read this workspace and create or edit drafts. It cannot send proposals, sign, change billing or change settings.</p><p>Requested access: ${escape(validated.scopes.join(", "))}</p><form method="post">${hidden}<button name="decision" value="allow">Allow access</button><a href="/settings/ai">Cancel</a></form></main></html>`,
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "Content-Security-Policy":
              "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
            "Set-Cookie": `oauth_csrf=${csrf}; HttpOnly; SameSite=Lax; Path=/oauth; Max-Age=600${s.issuer.startsWith("https:") ? "; Secure" : ""}`,
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
