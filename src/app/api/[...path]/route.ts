import { after } from "next/server";
import { staff } from "../../../lib/auth";
import { runtime as appRuntime, publicRuntime } from "../../../lib/runtime";
import { handle } from "../../../lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path;
  const response = await handle(request, path);
  if (
    response.ok &&
    request.method === "POST" &&
    path[0] === "webhooks" &&
    path[1] === "stripe"
  ) {
    const receipt = await response.clone().json();
    if (receipt.proposal_id) {
      const rt = appRuntime(path[2]);
      after(async () => {
        await rt.worker.drain(receipt.proposal_id);
      });
    }
  }
  if (
    response.ok &&
    request.method === "POST" &&
    ((path[0] === "public" && path[2] === "sign") ||
      (path[0] === "proposals" && ["send", "countersign"].includes(path[2])))
  ) {
    const rt =
      path[0] === "public"
        ? await publicRuntime(path[1])
        : appRuntime((await staff(request)).workspace_id);
    const id =
      path[0] === "public" ? (await rt.repo.byToken(path[1]))!.id : path[1];
    after(async () => {
      await rt.worker.drain(id);
    });
  }
  if (
    response.ok &&
    request.method === "POST" &&
    ((path[0] === "proposals" && path[2] === "reassign") ||
      (path[0] === "team" && path[1] === "reassign"))
  ) {
    const rt = appRuntime((await staff(request)).workspace_id);
    const result = await response.clone().json();
    const rows = Array.isArray(result) ? result : [result];
    after(async () => {
      for (const p of rows)
        for (const job of p.jobs ?? [])
          if (
            job.id.startsWith(p.id + ":reassigned:") &&
            job.status === "pending"
          )
            await rt.worker.drain(p.id, "email", job.id);
    });
  }
  if (
    response.ok &&
    request.method === "POST" &&
    path[0] === "public" &&
    path[2] === "engagement" &&
    path[3] === "start"
  ) {
    const result = await response.clone().json();
    if (result.ticket) {
      const rt = await publicRuntime(path[1]);
      const p = await rt.repo.byToken(path[1]);
      if (p)
        after(async () => {
          for (const job of p.jobs.filter(
            (j) => j.status === "pending" && j.id.includes(":notify:viewed:"),
          ))
            await rt.worker.drain(p.id, "email", job.id);
        });
    }
  }
  return response;
}
export { route as GET, route as POST, route as PUT, route as PATCH };
