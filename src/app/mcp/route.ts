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
        .select("user_id,status,password_change_required,display_name")
        .eq("user_id", auth.user_id)
        .eq("workspace_id", auth.actor.workspace_id)
        .maybeSingle();
      check(
        data &&
          !error &&
          (data.status ?? "active") === "active" &&
          !data.password_change_required,
        "Staff access revoked",
        401,
      );
      auth.actor.on_behalf_of_name =
        data.display_name ?? auth.actor.on_behalf_of_name;
    }
    const server = new Server(
      {
        name: "Yeswell",
        title: "Yeswell",
        description:
          "Prepare proposal drafts and maintain reviewed templates and saved blocks in Yeswell. Nothing is sent by the connector.",
        version: "2.0.0",
      },
      {
        capabilities: { tools: {} },
        instructions:
          "Starters are read-only: duplicate_template first. Created/duplicated templates are hidden until a person reviews and enables them in Studio. Use supplied prices or exact list_catalog values; never invent or calculate prices. Read get_template/get_saved_block before updating and pass its revision. Keep get_template preservation markers exact and unique; moving a marker moves its block. Missing ordinary markers remove blocks, but pricing, signatures, contracts and page breaks require explicit remove_blocks ids as well as omission. Never put block JSON in Markdown or invent markers. A 409 means reload and merge, never blindly retry. Sending, signing, availability, deletion, Reset and billing are human-only.",
      },
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
