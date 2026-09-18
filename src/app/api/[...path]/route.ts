import { handle } from "../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handle(request, (await context.params).path);
}
export { route as GET, route as POST, route as PUT, route as PATCH };
