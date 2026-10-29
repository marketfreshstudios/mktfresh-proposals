import { signatoryVersion, validateSignatureImage } from "./company-signatory";
import { oauthServer } from "./oauth-runtime";
import { StripeProvider } from "./providers/stripe";
import { QboProvider } from "./providers/qbo";
import { receiveStripeWebhook } from "./providers/webhook";
import { syncStripeCatalog, createCustomFamily } from "./catalog";
import { readiness } from "./quote";
import { PlaybookDraftSchema } from "./playbook";
import type { Item } from "./model";
import { WorkspaceSettingsSchema, type WorkspaceSettings } from "./workspace";
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
import {
  actor,
  equalSecret,
  login,
  staff,
  sameOrigin,
  workspaceStaff,
} from "./auth";
import { runtime, publicRuntime, allRuntimes } from "./runtime";
import { publicResult, event } from "./service";
import { mutate, type EntityTable } from "./repository";
import { sha256 } from "./content";
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
    if (path[0] === "auth" && path[1] === "local" && method === "POST") {
      check(
        process.env.APP_MODE === "local" &&
          process.env.NODE_ENV !== "production" &&
          !process.env.VERCEL,
        "Local login unavailable",
        404,
      );
      check(
        !req.headers.get("origin") || sameOrigin(req),
        "Same-origin request required",
        403,
      );
      const input = await body(req);
      check(
        equalSecret(input.token ?? "", process.env.DEV_STAFF_TOKEN ?? ""),
        "Invalid local token",
        401,
      );
      const response = json({ authenticated: true });
      response.headers.set(
        "Set-Cookie",
        `proposal_session=${input.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
      );
      return response;
    }
    if (path[0] === "auth" && path[1] === "login" && method === "POST") {
      check(
        !req.headers.get("origin") || sameOrigin(req),
        "Same-origin request required",
        403,
      );
      const input = z
        .object({ email: z.email(), password: z.string().min(1).max(200) })
        .parse(await body(req));
      const session = await login(input.email, input.password);
      const response = json({ authenticated: true });
      response.headers.set(
        "Set-Cookie",
        `proposal_session=${session.access_token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${session.expires_in}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
      return response;
    }
    if (path[0] === "webhooks" && path[1] === "stripe" && method === "POST") {
      const rt = runtime(uuid.parse(path[2]));
      check(
        rt.worker.providers.stripe instanceof StripeProvider,
        "Stripe test adapter not configured",
        503,
      );
      const raw = await req.text();
      check(Buffer.byteLength(raw) < 2000000, "Request too large", 413);
      return json(
        await receiveStripeWebhook(
          rt.repo,
          rt.worker.providers.stripe,
          raw,
          req.headers.get("stripe-signature") ?? "",
          process.env.STRIPE_WEBHOOK_SECRET ?? "",
        ),
      );
    }
    if (path[0] === "public") {
      const token = path[1],
        action = path[2],
        password = req.headers.get("x-proposal-password") ?? "",
        rt = await publicRuntime(token);
      if (method === "GET" && action === "brand") {
        const p = await rt.repo.byToken(token);
        check(p, "Not found", 404);
        const settings = p.workspace_settings;
        if (path[3] === "logo") {
          check(
            settings &&
              settings.logo &&
              settings.logo.startsWith(rt.repo.workspaceId + "/"),
            "Logo unavailable",
            404,
          );
          return new Response(
            Buffer.from(await rt.storage.get(settings.logo)),
            { headers: { ...headers, "Content-Type": "image/png" } },
          );
        }
        return json({
          name: settings?.company_name ?? "Proposal",
          email: settings?.email ?? "",
          logo: settings?.logo ?? null,
          accent_colour: settings?.accent_colour ?? "#245547",
        });
      }
      if (method === "GET" && !action)
        return json(
          publicResult(await rt.service.view(token, password, actor(req))),
        );
      if (method === "POST" && action === "quote") {
        const input = z
          .object({
            revision: z.number().int(),
            reviewed_hash: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .optional(),
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
      const results = [];
      for (const rt of await allRuntimes()) {
        await rt.service.tick();
        results.push(await rt.worker.drain());
      }
      return json(results);
    }
    const user = await staff(req),
      rt = runtime(user.workspace_id);
    if (path[0] === "auth" && path[1] === "session" && method === "GET") {
      const settings =
        (await rt.repo.entities<WorkspaceSettings>("workspace_settings"))[0] ??
        null;
      return json({
        user,
        settings,
        signatory_version: signatoryVersion(settings),
        staff: await workspaceStaff(user.workspace_id),
      });
    }
    if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
      const response = json({ signed_out: true });
      response.headers.set(
        "Set-Cookie",
        "proposal_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      return response;
    }
    if (path[0] === "workspace-logo") {
      if (method === "POST") {
        const input = await body(req);
        check(
          /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.image ?? ""),
          "PNG logo required",
        );
        const bytes = Buffer.from(input.image.split(",")[1], "base64");
        check(
          bytes.length < 750000 &&
            bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
          "Valid PNG under 750 KB required",
        );
        const path = rt.repo.workspaceId + "/" + sha256(bytes) + ".png";
        await rt.storage.put(path, bytes);
        return json({ path });
      }
      if (method === "GET") {
        const settings = (
          await rt.repo.entities<{ id: string; logo: string }>(
            "workspace_settings",
          )
        )[0];
        check(
          settings &&
            settings.logo &&
            settings.logo.startsWith(rt.repo.workspaceId + "/"),
          "Logo unavailable",
          404,
        );
        return new Response(Buffer.from(await rt.storage.get(settings.logo)), {
          headers: { ...headers, "Content-Type": "image/png" },
        });
      }
    }
    if (path[0] === "assistants") {
      const oauth = oauthServer();
      if (method === "GET")
        return json(
          (await oauth.store.list(rt.repo.workspaceId))
            .filter((r) => r.kind === "grant")
            .map((r) => ({
              id: r.id,
              name: r.data.connector_name,
              scopes: r.data.scopes,
              last_used: r.data.last_used,
              revoked: r.data.revoked,
            })),
        );
      if (method === "POST" && path[2] === "revoke") {
        await oauth.revoke(uuid.parse(path[1]), rt.repo.workspaceId);
        return json({ revoked: true });
      }
    }

    if (path[0] === "catalog-sync" && method === "POST") {
      const provider = path[1];
      if (provider === "stripe") {
        check(
          rt.worker.providers.stripe instanceof StripeProvider,
          "Stripe test credentials required",
          503,
        );
        return json(
          await syncStripeCatalog(rt.repo, rt.worker.providers.stripe.api),
        );
      }
      check(
        provider === "qbo" && rt.worker.providers.qbo instanceof QboProvider,
        "QuickBooks sandbox credentials required",
        503,
      );
      return json(await rt.worker.providers.qbo.syncCatalog());
    }
    if (path[0] === "custom-families" && method === "POST") {
      check(
        rt.worker.providers.stripe instanceof StripeProvider,
        "Stripe test credentials required",
        503,
      );
      const input = z
        .object({ name: z.string().min(3).max(100), request_id: uuid })
        .parse(await body(req));
      return json(
        await createCustomFamily(
          rt.repo,
          rt.worker.providers.stripe.api,
          input.name,
          "family:" + input.request_id,
        ),
        201,
      );
    }

    if (
      [
        "clients",
        "pricing_items",
        "templates",
        "content_library",
        "workspace_settings",
        "workspace_documents",
        "custom_families",
      ].includes(path[0])
    ) {
      const table = path[0] as EntityTable;
      if (method === "GET") return json(await rt.repo.entities(table));
      if (method === "POST" || method === "PUT") {
        const raw = await body(req);
        raw.id ??= randomUUID();
        let entity;
        if (table === "workspace_settings") {
          raw.id = rt.repo.workspaceId;
          entity = WorkspaceSettingsSchema.parse(raw);
          const previous = (
            await rt.repo.entities<WorkspaceSettings>("workspace_settings")
          )[0];
          if (
            JSON.stringify(entity.company_signatory ?? null) !==
            JSON.stringify(previous?.company_signatory ?? null)
          ) {
            check(
              user.staff_role === "owner",
              "Only workspace owners can change company signatory settings",
              403,
            );
            const config = entity.company_signatory;
            if (config) {
              const members = await workspaceStaff(user.workspace_id);
              check(
                config.authorized_user_ids.every((id) =>
                  members.some((m) => m.user_id === id),
                ),
                "Authorized signers must belong to this workspace",
              );
              if (config.user_id) {
                const signatory = members.find(
                  (m) => m.user_id === config.user_id,
                );
                check(
                  signatory,
                  "Designated signatory must belong to this workspace",
                );
                config.email = signatory.email;
              }
              if (config.image) await validateSignatureImage(config.image);
            }
          }
          check(
            !entity.logo || entity.logo.startsWith(rt.repo.workspaceId + "/"),
            "Logo must belong to this workspace",
          );
        } else if (table === "workspace_documents") {
          entity = z
            .object({
              id: uuid,
              name: z.string().min(1).max(200),
              version: z.string().min(1).max(100),
              format: z.enum(["markdown", "json"]),
              content: z.string().max(1000000),
            })
            .parse(raw);
          if (entity.format === "json") JSON.parse(entity.content);
        } else if (table === "custom_families") {
          throw new AppError(
            405,
            "Create custom families through the verified Stripe action",
          );
        } else if (table === "clients") entity = ClientSchema.parse(raw);
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
            .map(
              ({
                id,
                title,
                status,
                client,
                created_at,
                currency,
                source,
                files,
                quote,
                signers,
                jobs,
                ai_unreviewed,
                valid_until,
                sent_at,
                billing_links,
                origin,
              }) => ({
                id,
                title,
                status,
                client,
                created_at,
                currency,
                source,
                files,
                quote,
                signers,
                jobs,
                ai_unreviewed,
                valid_until,
                sent_at,
                billing_links,
                origin,
              }),
            ),
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
            playbook: PlaybookDraftSchema.optional(),
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
      if (method === "GET" && action === "ready") {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        return json(
          readiness(p, await rt.repo.entities<Item>("pricing_items")),
        );
      }
      if (method === "POST" && action === "send") {
        const input = req.headers
          .get("content-type")
          ?.includes("application/json")
          ? await body(req)
          : {};
        return json(
          await rt.service.send(id, user, input.confirm_ai_review === true),
        );
      }
      if (method === "POST" && action === "countersign")
        return json(
          await rt.service.sign(id, await body(req), "company", user),
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
            "Content-Disposition":
              new URL(req.url).searchParams.get("inline") === "1"
                ? 'inline; filename="proposal.pdf"'
                : 'attachment; filename="proposal.pdf"',
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
