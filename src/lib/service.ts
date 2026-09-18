import { randomBytes, randomUUID } from "node:crypto";
import {
  AppError,
  check,
  SignatureSchema,
  type Actor,
  type Block,
  type Client,
  type Item,
  type Job,
  type Proposal,
  type SignatureInput,
  type Template,
} from "./model";
import {
  CONSENT,
  sha256,
  hashPassword,
  passwordMatches,
  renderBlocks,
  totals,
  variables,
  versionHash,
} from "./content";
import { mutate, type Repository } from "./repository";
export const system: Actor = { actor: "system", ip: "", user_agent: "" };
export function event(
  p: Proposal,
  type: string,
  actor: Actor,
  metadata: Record<string, unknown> = {},
  now = new Date().toISOString(),
) {
  p.events.push({
    id: randomUUID(),
    type,
    ...actor,
    metadata,
    created_at: now,
  });
}
export function queue(
  p: Proposal,
  kind: Job["kind"],
  key: string,
  payload: Record<string, unknown>,
  now = new Date().toISOString(),
) {
  const id = p.id + ":" + key;
  if (!p.jobs.some((j) => j.id === id))
    p.jobs.push({
      id,
      kind,
      payload,
      status: "pending",
      attempts: 0,
      available_at: now,
    });
}
export function notify(p: Proposal, type: string) {
  queue(p, "email", "notify:" + type + ":" + p.events.length, {
    to: process.env.STAFF_EMAIL ?? "staff@example.test",
    subject: `Proposal ${type}: ${p.title}`,
    text: `${p.title} for ${p.client.company}: ${type}`,
  });
}
export function publicAccess(p: Proposal, password = "", now = new Date()) {
  check(p.source === "native" && p.token, "Not found", 404);
  check(
    !["draft", "expired", "declined", "archived"].includes(p.status),
    "Proposal unavailable",
    410,
  );
  if (["sent", "viewed"].includes(p.status))
    check(new Date(p.valid_until) > now, "Proposal expired", 410);
  if (p.password_hash)
    check(
      passwordMatches(password, p.password_hash),
      "Proposal password required",
      401,
    );
}
export class ProposalService {
  constructor(
    public repo: Repository,
    public clock = () => new Date(),
  ) {}
  async create(
    input: {
      client_id: string;
      template_id: string;
      title: string;
      valid_until: string;
      currency?: string;
      password?: string;
      oiot?: Proposal["oiot"];
    },
    actor: Actor,
  ) {
    const client = (await this.repo.entities<Client>("clients")).find(
        (c) => c.id === input.client_id,
      ),
      template = (await this.repo.entities<Template>("templates")).find(
        (t) => t.id === input.template_id && t.active,
      );
    check(client && template, "Client and active template required");
    check(input.title?.trim() && input.title.length <= 300, "Title required");
    check(
      Number.isFinite(Date.parse(input.valid_until)) &&
        new Date(input.valid_until) > this.clock(),
      "Future expiry required",
    );
    check(/^[A-Z]{3}$/.test(input.currency ?? "USD"), "Currency required");
    const catalog = await this.repo.entities<Item>("pricing_items");
    const quote = template.default_quote.map((q) => {
      const item = catalog.find((i) => i.id === q.pricing_item_id && i.active);
      check(item, "Inactive or missing pricing item");
      return {
        ...item,
        qty: q.qty,
        optional: q.optional,
        selected: q.optional ? q.selected : true,
      };
    });
    const now = this.clock().toISOString();
    const p: Proposal = {
      id: randomUUID(),
      revision: 0,
      client,
      template_id: template.id,
      title: input.title,
      status: "draft",
      token: null,
      password_hash: input.password ? hashPassword(input.password) : null,
      valid_until: new Date(input.valid_until).toISOString(),
      currency: input.currency ?? "USD",
      source: "native",
      proposify_id: null,
      created_by: actor.actor,
      created_at: now,
      updated_at: now,
      sent_at: null,
      first_viewed_at: null,
      client_signed_at: null,
      completed_at: null,
      content: structuredClone(template.content),
      quote,
      versions: [],
      signers: [],
      events: [],
      files: [],
      billing_links: [],
      jobs: [],
      search_text: "",
      ...(input.oiot ? { oiot: input.oiot } : {}),
    };
    event(p, "created", actor, {}, now);
    await this.repo.save(p, -1);
    return p;
  }
  async edit(
    id: string,
    input: {
      revision: number;
      title?: string;
      content?: Block[];
      quote?: Proposal["quote"];
      valid_until?: string;
    },
    actor: Actor,
  ) {
    return mutate(this.repo, id, (p) => {
      check(p.revision === input.revision, "Proposal changed; reload", 409);
      check(p.status === "draft", "Only drafts can be edited", 409);
      if (input.title) p.title = input.title;
      if (input.content) p.content = input.content;
      if (input.quote) p.quote = input.quote;
      if (input.valid_until) {
        check(
          Date.parse(input.valid_until) > this.clock().getTime(),
          "Future expiry required",
        );
        p.valid_until = new Date(input.valid_until).toISOString();
      }
      event(p, "edited", actor);
    });
  }
  async send(id: string, actor: Actor) {
    return mutate(this.repo, id, (p) => {
      check(
        ["draft", "sent", "viewed"].includes(p.status),
        "Cannot send signed or closed proposal",
        409,
      );
      check(new Date(p.valid_until) > this.clock(), "Proposal expired");
      check(p.quote.length > 0, "Quote required");
      for (const l of p.quote) {
        check(l.active, "Inactive pricing item");
        check(
          l.billing === "monthly" ? l.stripe_price_id : l.qbo_item_id,
          `Missing ${l.billing === "monthly" ? "Stripe price" : "QBO item"} mapping for ${l.sku}`,
        );
        check(l.optional || l.selected, "Required items must be selected");
      }
      const now = this.clock().toISOString();
      p.sent_at = now;
      p.token = randomBytes(32).toString("base64url");
      p.status = "sent";
      p.first_viewed_at = null;
      const map = variables(p);
      renderBlocks(p.content, p.quote, map, p.currency);
      const version = {
        id: randomUUID(),
        version_no: p.versions.length + 1,
        content: structuredClone(p.content),
        quote: structuredClone(p.quote),
        variables_resolved: map,
        content_hash: "",
        created_at: now,
        frozen: false,
      };
      version.content_hash = versionHash({
        content: version.content,
        quote: version.quote,
        variables_resolved: map,
      });
      p.versions.push(version);
      event(p, "sent", actor, { version: version.version_no }, now);
      queue(
        p,
        "email",
        "send:" + version.version_no,
        {
          to: p.client.email,
          subject: p.title,
          text: `Review your proposal: ${process.env.APP_URL ?? "http://127.0.0.1:3000"}/p/${p.token}`,
        },
        now,
      );
    });
  }
  async byToken(token: string, password = "") {
    check(/^[A-Za-z0-9_-]{43}$/.test(token), "Not found", 404);
    const p = (await this.repo.list()).find((x) => x.token === token);
    check(p, "Not found", 404);
    publicAccess(p, password, this.clock());
    return p;
  }
  async view(token: string, password: string, actor: Actor) {
    const p = await this.byToken(token, password);
    return mutate(this.repo, p.id, (p) => {
      publicAccess(p, password, this.clock());
      check(p.token === token, "Link superseded", 410);
      if (!p.first_viewed_at) {
        p.first_viewed_at = this.clock().toISOString();
        if (p.status === "sent") p.status = "viewed";
        event(p, "viewed", actor, {}, p.first_viewed_at);
        notify(p, "viewed");
      }
    });
  }
  async toggle(
    token: string,
    password: string,
    input: { revision: number; item_id: string; selected: boolean },
    actor: Actor,
  ) {
    const p = await this.byToken(token, password);
    return mutate(this.repo, p.id, (p) => {
      publicAccess(p, password, this.clock());
      check(p.token === token, "Link superseded", 410);
      check(["sent", "viewed"].includes(p.status), "Quote is frozen", 409);
      check(p.revision === input.revision, "Quote changed; reload", 409);
      const l = p.quote.find((x) => x.id === input.item_id);
      check(l?.optional, "Only optional items can be toggled");
      l.selected = input.selected;
      const v = p.versions.at(-1)!;
      v.quote = structuredClone(p.quote);
      v.variables_resolved = variables(p);
      renderBlocks(v.content, v.quote, v.variables_resolved, p.currency);
      v.content_hash = versionHash({
        content: v.content,
        quote: v.quote,
        variables_resolved: v.variables_resolved,
      });
      event(p, "quote_changed", actor, {
        item_id: l.id,
        selected: l.selected,
        totals: totals(p.quote),
      });
    });
  }
  async sign(
    id: string,
    raw: SignatureInput,
    role: "client" | "company",
    actor: Actor,
    access?: { token: string; password: string },
  ) {
    const input = SignatureSchema.parse(raw);
    if (input.kind === "drawn") {
      const { PDFDocument } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      try {
        await doc.embedPng(Buffer.from(input.image!.split(",")[1], "base64"));
      } catch {
        throw new AppError(400, "Invalid PNG signature");
      }
    }
    return mutate(this.repo, id, (p) => {
      if (role === "client") {
        check(access, "Public access required");
        publicAccess(p, access.password, this.clock());
        check(access.token === p.token, "Link superseded", 410);
      }
      check(
        p.revision === input.revision,
        "Proposal changed; reload before signing",
        409,
      );
      check(
        role === "client"
          ? ["sent", "viewed"].includes(p.status)
          : p.status === "signed_by_client",
        "Invalid signing order or already signed",
        409,
      );
      check(
        role !== "company" || actor.actor.startsWith("staff:"),
        "Staff authorization required",
        403,
      );
      if (role === "client")
        check(
          input.email.toLowerCase() === p.client.email.toLowerCase(),
          "Signer email must match recipient",
        );
      const now = this.clock().toISOString(),
        v = p.versions.at(-1)!;
      if (role === "client") {
        v.frozen = true;
        v.content_hash = versionHash({
          content: v.content,
          quote: v.quote,
          variables_resolved: v.variables_resolved,
        });
        p.client_signed_at = now;
        p.status = "signed_by_client";
      } else {
        p.completed_at = now;
        p.status = "completed";
      }
      const { revision: _, consent: __, ...signature } = input;
      p.signers.push({
        ...signature,
        ...actor,
        role,
        signed_at: now,
        consent_at: now,
        consent_text: CONSENT,
        ...(input.kind === "drawn"
          ? {
              signature_image_path: `${p.id}/${sha256(Buffer.from(input.image!.split(",")[1], "base64"))}.png`,
            }
          : {}),
      });
      event(p, "consent_given", actor, { role, consent_text: CONSENT }, now);
      event(
        p,
        role === "client" ? "signed" : "counter_signed",
        actor,
        { role, version_hash: v.content_hash },
        now,
      );
      queue(
        p,
        "pdf",
        "pdf:" + role,
        {
          stage: role,
          version: structuredClone(v),
          signers: structuredClone(p.signers),
          events: structuredClone(p.events),
        },
        now,
      );
      if (role === "client") queue(p, "billing", "billing", {}, now);
      notify(p, role === "client" ? "signed" : "completed");
    });
  }
  async decline(token: string, password: string, actor: Actor) {
    const p = await this.byToken(token, password);
    return mutate(this.repo, p.id, (p) => {
      publicAccess(p, password, this.clock());
      check(
        p.token === token && ["sent", "viewed"].includes(p.status),
        "Cannot decline",
        409,
      );
      p.status = "declined";
      event(p, "declined", actor);
    });
  }
  async tick() {
    for (const item of await this.repo.list()) {
      if (!["sent", "viewed"].includes(item.status)) continue;
      await mutate(this.repo, item.id, (p) => {
        if (!["sent", "viewed"].includes(p.status)) return;
        const now = this.clock();
        if (new Date(p.valid_until) <= now) {
          p.status = "expired";
          event(p, "expired", system, {}, now.toISOString());
          return;
        }
        const age = (now.getTime() - Date.parse(p.sent_at!)) / 86400000;
        for (const day of [3, 7])
          if (
            age >= day &&
            !p.events.some(
              (e) =>
                e.type === "reminder_sent" &&
                e.metadata.day === day &&
                e.metadata.version === p.versions.length,
            )
          ) {
            queue(
              p,
              "email",
              `reminder:${p.versions.length}:${day}`,
              {
                to: p.client.email,
                subject: `Reminder: ${p.title}`,
                text: `Review your proposal: ${process.env.APP_URL}/p/${p.token}`,
                reminder_day: day,
                version: p.versions.length,
              },
              now.toISOString(),
            );
          }
      });
    }
  }
}
export function publicResult(p: Proposal) {
  const v = p.versions.at(-1)!;
  return {
    id: p.id,
    title: p.title,
    status: p.status,
    revision: p.revision,
    valid_until: p.valid_until,
    currency: p.currency,
    html: renderBlocks(v.content, v.quote, v.variables_resolved, p.currency),
    quote: v.quote.map(
      ({
        id,
        name,
        description,
        unit_price,
        qty,
        optional,
        selected,
        billing,
      }) => ({
        id,
        name,
        description,
        unit_price,
        qty,
        optional,
        selected,
        billing,
      }),
    ),
    totals: totals(v.quote),
    consent_text: CONSENT,
    version_hash: v.content_hash,
    files: p.files
      .filter((f) => f.kind === "sealed")
      .map((f) => ({ id: f.id, stage: f.stage, sha256: f.sha256 })),
  };
}
