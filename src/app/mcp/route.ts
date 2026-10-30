import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { oauthServer } from "../../lib/oauth-runtime";
import { runtime as appRuntime } from "../../lib/runtime";
import { aiTool, toolDefinitions } from "../../lib/ai-tools";
import { supabase } from "../../lib/repository";
import { check, AppError } from "../../lib/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
async function handler(req: Request) {
  const oauth = oauthServer();
  try {
    const origin = req.headers.get("origin");
    check(
      !origin ||
        [oauth.issuer, "https://claude.ai", "https://chatgpt.com"].includes(
          origin,
        ),
      "Origin denied",
      403,
    );
    const auth = await oauth.authenticate(
      (req.headers.get("authorization") ?? "").replace(/^Bearer /, ""),
    );
    if (process.env.APP_MODE !== "local") {
      const { data, error } = await supabase()
        .from("staff_users")
        .select("user_id")
        .eq("user_id", auth.user_id)
        .eq("workspace_id", auth.actor.workspace_id)
        .maybeSingle();
      check(data && !error, "Staff access revoked", 401);
    }
    const server = new Server(
      { name: "proposal-drafting", version: "2.0.0" },
      { capabilities: { tools: {} } },
    );
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolDefinitions as any,
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const result = await aiTool(
          appRuntime(auth.actor.workspace_id).repo,
          auth.actor,
          request.params.name,
          request.params.arguments ?? {},
          auth.scopes,
          appRuntime(auth.actor.workspace_id).service,
        );
        const text = JSON.stringify(result);
        check(text.length < 140000, "Result is too large; narrow your search");
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: e instanceof Error ? e.message : "Tool failed",
            },
          ],
        };
      }
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (e) {
    const status = e instanceof AppError ? e.status : 401;
    return Response.json(
      { error: status === 401 ? "Authentication required" : "Request denied" },
      {
        status,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${oauth.issuer}/.well-known/oauth-protected-resource"`,
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
export { handler as GET, handler as POST, handler as DELETE };
