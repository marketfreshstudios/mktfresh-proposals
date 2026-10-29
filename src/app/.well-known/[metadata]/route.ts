import { oauthServer } from "../../../lib/oauth-runtime";
export async function GET(
  req: Request,
  context: { params: Promise<{ metadata: string }> },
) {
  const name = (await context.params).metadata,
    s = oauthServer();
  if (name === "oauth-authorization-server") return Response.json(s.metadata());
  if (name === "oauth-protected-resource")
    return Response.json({
      resource: s.resource,
      authorization_servers: [s.issuer],
      scopes_supported: ["proposals:read", "proposals:draft"],
      bearer_methods_supported: ["header"],
    });
  return new Response(null, { status: 404 });
}
