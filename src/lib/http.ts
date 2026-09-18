import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  ClientSchema,
  ItemSchema,
  LineSchema,
  SignatureSchema,
  check,
  type Block,
  type Template,
} from "./model";
import { actor, equalSecret, login, staff } from "./auth";
import { runtime } from "./runtime";
import { publicResult, event } from "./service";
import { mutate, type EntityTable } from "./repository";
import { CONSENT, htmlDocument } from "./content";
const uuid = z.string().uuid();
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}
async function body(req: Request) {
  const text = await req.text();
  check(Buffer.byteLength(text) < 2000000, "Request too large", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "Invalid JSON");
  }
}
export async function handle(req: Request, path: string[]) {
  try {
    const method = req.method;
    if (path[0] === "auth" && path[1] === "login" && method === "POST") {
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(await body(req));
      return json(await login(input.email, input.password));
    }
    if (path[0] === "public") {
      const token = path[1],
        action = path[2],
        password = req.headers.get("x-proposal-password") ?? "",
        rt = runtime();
      if (method === "GET" && !action)
        return json(
          publicResult(await rt.service.view(token, password, actor(req))),
        );
      if (method === "POST" && action === "quote") {
        const input = z
          .object({
            revision: z.number().int(),
            item_id: uuid,
            selected: z.boolean(),
          })
          .parse(await body(req));
        return json(
          publicResult(
            await rt.service.toggle(token, password, input, actor(req)),
          ),
        );
      }
      if (method === "POST" && action === "sign") {
        const p = await rt.service.byToken(token, password),
          input = SignatureSchema.parse(await body(req));
        return json(
          publicResult(
            await rt.service.sign(p.id, input, "client", actor(req), {
              token,
              password,
            }),
          ),
        );
      }
      if (method === "POST" && action === "decline")
        return json(
          publicResult(await rt.service.decline(token, password, actor(req))),
        );
      if (method === "GET" && action === "files") {
        const p = await rt.service.byToken(token, password),
          f = p.files.find((f) => f.id === path[3] && f.kind === "sealed");
        check(f, "File not found", 404);
        if (path[4] === "verify") return json(await rt.worker.verify(p, f.id));
        const data = await rt.storage.get(f.storage_path);
        await mutate(rt.repo, p.id, (p) =>
          event(p, "downloaded", actor(req), { file_id: f.id }),
        );
        return new Response(Buffer.from(data), {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="signed-proposal.pdf"',
          },
        });
      }
      throw new AppError(404, "Route not found");
    }
    if (path[0] === "cron") {
      check(
        equalSecret(
          req.headers.get("authorization") ?? "",
          `Bearer ${process.env.CRON_SECRET ?? ""}`,
        ) && !!process.env.CRON_SECRET,
        "Cron authentication required",
        401,
      );
      check(method === "GET" || method === "POST", "Method not allowed", 405);
      const rt = runtime();
      await rt.service.tick();
      return json(await rt.worker.drain());
    }
    const user = await staff(req),
      rt = runtime();
    if (
      ["clients", "pricing_items", "templates", "content_library"].includes(
        path[0],
      )
    ) {
      const table = path[0] as EntityTable;
      if (method === "GET") return json(await rt.repo.entities(table));
      if (method === "POST" || method === "PUT") {
        const raw = await body(req);
        raw.id ??= randomUUID();
        let entity;
        if (table === "clients") entity = ClientSchema.parse(raw);
        else if (table === "pricing_items") entity = ItemSchema.parse(raw);
        else if (table === "templates") {
          entity = z
            .object({
              id: uuid,
              name: z.string().min(1).max(200),
              content: z.array(z.record(z.string(), z.unknown())).max(300),
              default_quote: z
                .array(
                  z.object({
                    pricing_item_id: uuid,
                    qty: z.number().int().min(1).max(10000),
                    optional: z.boolean(),
                    selected: z.boolean(),
                  }),
                )
                .max(100),
              active: z.boolean(),
            })
            .parse(raw);
        } else
          entity = z
            .object({
              id: uuid,
              name: z.string().min(1).max(200),
              block: z.record(z.string(), z.unknown()),
            })
            .parse(raw);
        await rt.repo.put(table, entity);
        return json(entity, 201);
      }
    }
    if (path[0] === "proposals") {
      const id = path[1],
        action = path[2];
      if (method === "GET" && !id) {
        const q = new URL(req.url).searchParams;
        const list = (await rt.repo.list(q.get("q") ?? undefined)).filter(
          (p) =>
            (!q.get("status") || p.status === q.get("status")) &&
            (!q.get("client") || p.client.id === q.get("client")) &&
            (!q.get("source") || p.source === q.get("source")) &&
            (!q.get("from") || p.created_at >= q.get("from")!) &&
            (!q.get("to") || p.created_at <= q.get("to")!),
        );
        const offset = Math.max(0, Number(q.get("offset")) || 0),
          limit = Math.min(100, Math.max(1, Number(q.get("limit")) || 50));
        return json({
          total: list.length,
          items: list
            .slice(offset, offset + limit)
            .map(({ id, title, status, client, created_at, source }) => ({
              id,
              title,
              status,
              client,
              created_at,
              source,
            })),
        });
      }
      if (method === "POST" && !id) {
        const input = z
          .object({
            client_id: uuid,
            template_id: uuid,
            title: z.string().min(1).max(300),
            valid_until: z.string(),
            currency: z.string().length(3).optional(),
            password: z.string().min(8).max(200).optional(),
            oiot: z
              .object({
                full_price: z.number().int().positive(),
                kickoff: z.number().int().positive(),
                pages: z.number().int().positive(),
              })
              .optional(),
          })
          .parse(await body(req));
        return json(await rt.service.create(input, user), 201);
      }
      uuid.parse(id);
      if (method === "GET" && !action) {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        return json(p);
      }
      if (method === "PATCH" && !action) {
        const input = z
          .object({
            revision: z.number().int(),
            title: z.string().min(1).max(300).optional(),
            content: z
              .array(z.record(z.string(), z.unknown()))
              .max(300)
              .optional(),
            quote: z.array(LineSchema).max(100).optional(),
            valid_until: z.string().optional(),
          })
          .parse(await body(req));
        return json(
          await rt.service.edit(
            id,
            input as { revision: number; content?: Block[] },
            user,
          ),
        );
      }
      if (method === "POST" && action === "send")
        return json(await rt.service.send(id, user));
      if (method === "POST" && action === "countersign")
        return json(
          await rt.service.sign(
            id,
            SignatureSchema.parse(await body(req)),
            "company",
            user,
          ),
        );
      if (method === "POST" && action === "retry") {
        await rt.worker.retry(id);
        return json(await rt.worker.drain(id));
      }
      if (method === "POST" && action === "jobs")
        return json(await rt.worker.drain(id));
      if (method === "GET" && action === "files") {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        const f = p.files.find((x) => x.id === path[3]);
        check(f, "Not found", 404);
        if (path[4] === "verify") return json(await rt.worker.verify(p, f.id));
        return new Response(Buffer.from(await rt.storage.get(f.storage_path)), {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="proposal.pdf"',
          },
        });
      }
    }
    throw new AppError(404, "Route not found");
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError)
      return json({ error: "Invalid request", issues: e.issues }, 400);
    console.error(
      "Request failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return json({ error: "Internal service error" }, 500);
  }
}
export async function publicPage(req: Request, token: string) {
  try {
    const rt = runtime(),
      password = req.headers.get("x-proposal-password") ?? "";
    const p = await rt.service.view(token, password, actor(req));
    const data = publicResult(p);
    const harness =
      process.env.APP_MODE === "local" && process.env.NODE_ENV !== "production";
    const controls = harness
      ? `<hr><p>Development signing harness</p><pre id="state">${JSON.stringify({ revision: data.revision, quote: data.quote }).replace(/</g, "&lt;")}</pre><p>${CONSENT}</p><form id="sign"><label>Name <input name="name" required></label><label>Email <input name="email" type="email" required></label><label><input name="consent" type="checkbox" required> I agree to the consent above</label><button>Sign</button></form><pre id="result"></pre><script>document.getElementById('sign').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const r=await fetch('/api/public/${token}/sign',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:${data.revision},name:f.get('name'),email:f.get('email'),consent:f.get('consent')==='on',kind:'typed',typed_name:f.get('name')})});document.getElementById('result').textContent=JSON.stringify(await r.json());};</script>`
      : "";
    return new Response(htmlDocument(data.html + controls), {
      headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": harness
          ? "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'"
          : "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
      },
    });
  } catch (e) {
    return json(
      {
        error: e instanceof AppError ? e.message : "Unable to render proposal",
      },
      e instanceof AppError ? e.status : 500,
    );
  }
}
