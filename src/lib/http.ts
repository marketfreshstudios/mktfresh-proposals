import { waitingForInvoiceCountersignature } from "./proposal-state";
import {
  processStaffPasswordReset,
  staffResetExpiryMinutes,
  staffResetRequest,
} from "./staff-reset";
import { AskQuestionSchema, StaffQuestionSchema } from "./proposal-questions";
import {
  askQuestion,
  changeQuestion,
  clientQuestions,
  deliverQuestionMail,
  QuestionProposalChanged,
  staffQuestions,
} from "./question-service";
import {
  EngagementStartSchema,
  EngagementSnapshotSchema,
  publicEngagement,
  engagementTargets,
} from "./engagement";
import {
  engagementBot,
  startEngagement,
  recordEngagement,
  engagementReport,
} from "./engagement-server";
import {
  studioEntityViews,
  writeStudioEntity,
  restoreConnectorChange,
  connectorActivityViews,
} from "./studio-history";
import {
  TemplateInputSchema,
  libraryTemplates,
  libraryStarterAction,
} from "./template-library";
import { extractBrandPalette, validateCoverImage } from "./brand-palette";
import { limitClientLink } from "./client-link-limits";
import {
  uploadWorkspaceIcon,
  readWorkspaceIcon,
  workspaceIconPath,
} from "./workspace-icon";
import { withSignatureHeadings } from "./signature-headings";
import { proposalOwnerId } from "./proposal-owner";
import {
  prepareLinkedSave,
  savedBlockViews,
  validateSavedBlock,
} from "./saved-blocks";
import type { SavedBlock } from "./model";
import { ReassignmentService } from "./reassignment";
import { TeamWorkConflict } from "./team";
import { teamService } from "./team-runtime";
import { StaffPasswordRequired, validateStaffMembership } from "./staff-access";
import { setStaffPassword } from "./staff-password";
import {
  clearStaffIdentity,
  priorStaffState,
  staffIdentityCookie,
  staffIdentityCookieName,
  StaffSecurityRequired,
} from "./staff-security-session";
import {
  changeSecurityPassword,
  manageStaffSessions,
  readStaffSecurity,
  recordStaffDevice,
  staffFactorAction,
  staffSecurityIdentity,
  verifyStaffSignIn,
} from "./staff-security";
import {
  confirmStaffEmailChange,
  staffEmailAction,
  staffPendingEmail,
} from "./staff-email-change";
import {
  StaffSessionExpired,
  setStaffCookies,
  clearStaffCookies,
  withStaffCookies,
  revokeStaffSession,
} from "./staff-session";
import {
  HeaderFooterSettingsSchema,
  TemplateBandsSchema,
  defaultTemplateBands,
} from "./page-bands";
import {
  CoverSchema,
  loadedCover,
  defaultCover,
  contentAfterCover,
} from "./cover";
import { publishedExpiry } from "./editor-publication";
import { PagePlanSchema } from "./page-plan";
import { authoringPreview } from "./authoring-preview";
import { pdfPreview } from "./pdf-preview";
import { reviewBlocks } from "./ai-review";
import { StyleOverridesSchema, styleFonts } from "./proposal-styles";
import {
  emailTemplates,
  saveEmailTemplate,
  proposalEmailLog,
} from "./email-templates";
import { emailStudioPreview, sendEmailTest } from "./email-studio";
import {
  activity,
  providerActivity,
  activityCsv,
  uploadFont,
  uploadedFonts,
  readFont,
  validateFonts,
  validateStyles,
  workspaceEvent,
} from "./studio";
import { clientBilling } from "./client-billing";
import { DuplicateClient, linkStripeCustomer } from "./clients";
import { proposalAction, proposalActions } from "./proposal-actions";
import { previewResult } from "./preview";
import {
  documents,
  saveDocument,
  refreshDocument,
  refreshDueDocuments,
} from "./documents";
import { appOrigin } from "./links";
import { signatoryVersion, validateSignatureImage } from "./company-signatory";
import { StaffAccountPatchSchema } from "./staff-account-model";
import {
  readStaffAccount,
  saveStaffAccount,
  saveStaffPhoto,
  staffPhoto,
  readStaffPhoto,
  saveAccountSignature,
  workspaceStaffPhotos,
} from "./staff-account";
import { oauthServer } from "./oauth-runtime";
import { StripeProvider } from "./providers/stripe";
import { QboProvider } from "./providers/qbo";
import { QBO_CALLBACK, QBO_STATE_COOKIE } from "./providers/qbo-connection";
import {
  qboBillingEmail,
  proposalInvoiceRef,
  quickBooksCustomerReview,
} from "./qbo-mapping";
import { receiveStripeWebhook, verifyStripeWebhook } from "./providers/webhook";
import { stripeConnectCookie } from "./providers/stripe-connect";
import { syncStripeCatalog, createCustomFamily } from "./catalog";
import { PlaybookDraftSchema } from "./playbook";
import type { Item } from "./model";
import {
  LOCAL_WORKSPACE_ID,
  WorkspaceSettingsSchema,
  type WorkspaceSettings,
} from "./workspace";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  AppError,
  ClientSchema,
  ItemSchema,
  BillingLineSchema,
  QuoteSchema,
  SignatureSchema,
  check,
  type Block,
  type Template,
} from "./model";
import {
  actor,
  cookie,
  equalSecret,
  login,
  staff,
  sameOrigin,
  workspaceStaff,
  updateStaffDisplayName,
  dismissStaffHomeBanner,
} from "./auth";
import { publicRuntime, allRuntimes } from "./runtime";
import { workspaceRuntime, stripeWebhookWorkspace } from "./workspace-runtime";
import { publicResult, event } from "./service";
import {
  mutate,
  SupabaseRepository,
  supabase,
  type Repository,
  type EntityTable,
} from "./repository";
import { CONSENT, hashPassword, sha256 } from "./content";
import {
  readReport,
  reportCsv,
  reportDrilldown,
  reportExportSort,
} from "./report-server";
const uuid = z.string().uuid();
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}
function iconRequestSize(req: Request, fallback: number): number | "original" {
  const raw = new URL(req.url).searchParams.get("size");
  return raw === "original" ? "original" : Number(raw ?? fallback);
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
const resolvedClientLinks = new WeakSet<Request>();
type AfterResponse = (work: () => Promise<void>) => void;
async function workspaceDefaults(
  repo: Repository,
  user: { staff_name?: string; staff_email?: string },
) {
  let company = "Your workspace";
  if (repo instanceof SupabaseRepository) {
    const { data, error } = await supabase()
      .from("workspaces")
      .select("name")
      .eq("id", repo.workspaceId)
      .single();
    if (error) throw error;
    company = data.name;
  }
  return WorkspaceSettingsSchema.parse({
    id: repo.workspaceId,
    company_name: company,
    owner: user.staff_name ?? "",
    email: user.staff_email,
    phone: "",
    address: "",
    logo: null,
    accent_colour: "#13303A",
    consent_text: CONSENT,
    reminder_days: [3, 7],
    timezone: "UTC",
    qbo_custom_item_ref: null,
    collection_method: "charge_automatically",
  });
}

export async function handle(
  req: Request,
  path: string[],
  afterResponse?: AfterResponse,
) {
  const result =
    path[0] === "public"
      ? await limitClientLink(
          req,
          path[1] ?? "",
          () => handleRoute(req, path, afterResponse),
          () => resolvedClientLinks.has(req),
        )
      : await handleRoute(req, path, afterResponse);
  return withStaffCookies(req, result);
}
async function handleRoute(
  req: Request,
  path: string[],
  afterResponse?: AfterResponse,
) {
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
      const session = await login(input.email, input.password).catch(
        async (error) => {
          if (error instanceof AppError && error.status === 401) {
            const state = await priorStaffState(req);
            if (state) throw new StaffSecurityRequired(state.state);
          }
          throw error;
        },
      );
      const membership = await validateStaffMembership(
        session.user,
        session.access_token,
        { passwordChange: true, twoStep: true },
      );
      await recordStaffDevice(req, session);
      const response = json({
        authenticated: !membership.two_step_required,
        ...(membership.two_step_required ? { two_step_required: true } : {}),
        ...(membership.password_change_required
          ? { password_change_required: true }
          : {}),
      });
      if (!membership.two_step_required) {
        const identity = staffIdentityCookie(session.user.id);
        if (identity) response.headers.append("Set-Cookie", identity);
      }
      return setStaffCookies(
        response,
        session,
        membership.two_step_required ? 600 : undefined,
      );
    }
    if (path.join("/") === "auth/account-state" && method === "GET")
      return json(await priorStaffState(req, true));
    if (path.join("/") === "auth/two-step" && method === "POST") {
      check(sameOrigin(req), "Same-origin request required", 403);
      const identity = await verifyStaffSignIn(req, await body(req));
      const response = json({
        authenticated: true,
        password_change_required: identity.member.password_change_required,
      });
      const hint = staffIdentityCookie(identity.user.id);
      if (hint) response.headers.append("Set-Cookie", hint);
      return setStaffCookies(response, identity);
    }
    if (path.join("/") === "auth/confirm-email" && method === "POST") {
      check(sameOrigin(req), "Same-origin request required", 403);
      return json(await confirmStaffEmailChange(req, await body(req)));
    }
    if (
      path[0] === "auth" &&
      path[1] === "reset-password" &&
      path.length === 2 &&
      method === "POST"
    ) {
      check(sameOrigin(req), "Same-origin request required", 403);
      const input = staffResetRequest.safeParse(
        await body(req).catch(() => null),
      );
      if (input.success)
        afterResponse?.(() =>
          processStaffPasswordReset(input.data.email, req.headers),
        );
      return json({
        accepted: true,
        expires_in_minutes: staffResetExpiryMinutes,
      });
    }
    if (path[0] === "auth" && path[1] === "set-password" && method === "POST") {
      check(sameOrigin(req), "Same-origin request required", 403);
      const session = await setStaffPassword(
        req,
        await body(req),
        afterResponse,
      );
      const response = json({ authenticated: true });
      const hint = staffIdentityCookie(session.user.id);
      if (hint) response.headers.append("Set-Cookie", hint);
      await recordStaffDevice(req, session);
      return setStaffCookies(response, session);
    }
    if (path[0] === "webhooks" && path[1] === "stripe" && method === "POST") {
      const isConnect = path[2] === "connect";
      const secret =
        (isConnect
          ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET
          : process.env.STRIPE_WEBHOOK_SECRET) ?? "";
      const raw = await req.text();
      check(Buffer.byteLength(raw) < 2000000, "Request too large", 413);
      const signature = req.headers.get("stripe-signature") ?? "";
      const webhook = verifyStripeWebhook(raw, signature, secret);
      let workspaceId = LOCAL_WORKSPACE_ID;
      if (isConnect) {
        check(
          typeof webhook.account === "string",
          "Stripe connected account required.",
          403,
        );
        const routed = await stripeWebhookWorkspace(webhook.account);
        if (!routed) return json({ received: true, ignored: true });
        workspaceId = routed;
      } else {
        check(
          uuid.parse(path[2]) === LOCAL_WORKSPACE_ID && !webhook.account,
          "Use the Stripe Connect endpoint for connected accounts.",
          403,
        );
      }
      const stripeRuntime = await workspaceRuntime(workspaceId);
      if (isConnect && webhook.type === "account.application.deauthorized") {
        await stripeRuntime.stripeConnect?.revoked(
          webhook.account!,
          webhook.created,
        );
        return json({ received: true });
      }
      if (
        isConnect &&
        (await stripeRuntime.stripeConnect?.activeAccount())?.id !==
          webhook.account
      )
        return json({ received: true, ignored: true });
      check(
        stripeRuntime.worker.providers.stripe instanceof StripeProvider,
        "Stripe test adapter not configured",
        503,
      );
      const receipt = await receiveStripeWebhook(
        stripeRuntime.repo,
        stripeRuntime.worker.providers.stripe,
        raw,
        signature,
        secret,
        isConnect ? webhook.account : undefined,
      );
      if (receipt.proposal_id)
        afterResponse?.(async () => {
          await stripeRuntime.worker.drain(receipt.proposal_id);
        });
      return json(receipt);
    }
    if (path[0] === "public") {
      const token = path[1],
        action = path[2],
        password = req.headers.get("x-proposal-password") ?? "",
        rt = await publicRuntime(token);
      resolvedClientLinks.add(req);
      const workspaceBrand = (
        await rt.repo.entities<WorkspaceSettings>("workspace_settings")
      )[0];
      const engagementAllowed =
        !engagementBot(req.headers) &&
        !cookie(req, "proposal_session") &&
        !cookie(req, "proposal_refresh") &&
        !req.headers.has("authorization");
      const qbo = rt.worker?.providers?.qbo;
      const qboConnected =
        qbo instanceof QboProvider &&
        (await qbo.connection.status()).state === "connected";
      const clientResult = (p: import("./model").Proposal) =>
        publicResult(p, {
          qboConnected,
          showPoweredBy: workspaceBrand?.show_powered_by !== false,
          engagementAllowed,
        });
      if (method === "GET" && action === "brand") {
        const p = await rt.repo.byToken(token);
        check(p, "Not found", 404);
        const settings = p.workspace_settings;
        if (path[3] === "sender-photo") {
          check(
            p.sender?.photo_path && p.sender.user_id,
            "Photo unavailable",
            404,
          );
          return new Response(
            Buffer.from(
              await readStaffPhoto(
                rt.storage,
                rt.repo.workspaceId,
                p.sender.user_id,
                p.sender.photo_path,
              ),
            ),
            {
              headers: {
                ...headers,
                "Content-Type": "image/png",
                "X-Content-Type-Options": "nosniff",
              },
            },
          );
        }
        if (path[3] === "icon") {
          return new Response(
            Buffer.from(
              await readWorkspaceIcon(
                rt.storage,
                rt.repo.workspaceId,
                workspaceBrand?.logo_icon,
                iconRequestSize(req, 32),
              ),
            ),
            { headers: { ...headers, "Content-Type": "image/png" } },
          );
        }
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
        const expiry = publishedExpiry(p);
        const expired =
          p.status === "expired" ||
          (["sent", "viewed"].includes(p.status) &&
            !!expiry &&
            Date.parse(expiry) <= Date.now());
        return json({
          logo_icon: workspaceBrand?.logo_icon
            ? sha256(workspaceBrand.logo_icon.path).slice(0, 16)
            : null,
          show_powered_by: workspaceBrand?.show_powered_by !== false,
          name: settings?.company_name ?? "Proposal",

          contact: {
            name: p.sender?.display_name ?? settings?.owner ?? "",
            email: p.sender?.email ?? settings?.email ?? "",
            phone:
              expired || p.status === "declined" || p.archived_at
                ? p.sender?.phone
                : undefined,
            job_title: p.sender?.job_title,
            photo_url: p.sender?.photo_path
              ? `/api/public/${token}/brand/sender-photo`
              : undefined,
          },
          ...(expired ? { valid_until: expiry } : {}),
          timezone: settings?.timezone,
          proposal_fonts: settings?.proposal_fonts,
          ended:
            p.status === "declined" ? "declined" : expired ? "expired" : null,
          email: settings?.email ?? "",
          phone: settings?.phone,
          logo: settings?.logo ?? null,
          accent_colour: settings?.accent_colour ?? "#245547",
        });
      }
      if (method === "GET" && action === "fonts") {
        const p = await rt.repo.byToken(token);
        check(p, "Font unavailable", 404);
        const font = [
          ...Object.values(p.workspace_settings?.proposal_fonts ?? {}),
          ...styleFonts(p.versions.at(-1)?.resolved_styles),
        ].find((f) => typeof f !== "string" && f.id === path[3]);
        check(
          font &&
            typeof font !== "string" &&
            font.path.startsWith(rt.repo.workspaceId + "/fonts/"),
          "Font unavailable",
          404,
        );
        return new Response(
          Buffer.from(await readFont(rt.storage, font, rt.repo.workspaceId)),
          {
            headers: { ...headers, "Content-Type": `font/${font.format}` },
          },
        );
      }
      if (action === "questions" && !path[3]) {
        if (method === "GET")
          return json(
            await clientQuestions(
              rt.repo,
              await rt.service.byToken(token, password),
            ),
          );
        if (method === "POST") {
          check(sameOrigin(req), "Same-origin request required", 403);
          const input = AskQuestionSchema.parse(await body(req));
          for (let attempt = 0; ; attempt++) {
            const p = await rt.service.byToken(token, password);
            try {
              return json(
                await askQuestion(rt.repo, p, input, {
                  notifyAdmins: workspaceBrand?.question_notify_admins,
                }),
                201,
              );
            } catch (error) {
              if (!(error instanceof QuestionProposalChanged) || attempt === 2)
                throw error;
            }
          }
        }
      }
      if (method === "GET" && action === "state") {
        const proposal = await rt.service.byToken(token, password);
        check(
          proposal.client_signed_at,
          "Billing state is available after signing",
          409,
        );
        return json(clientResult(proposal));
      }
      if (method === "POST" && action === "engagement") {
        check(sameOrigin(req), "Same-origin request required", 403);
        // Staff visits, previews and scanners never create a qualified view.
        if (!engagementAllowed) return json({ ignored: true });
        const raw = await req.text();
        check(
          Buffer.byteLength(raw) <= 60000,
          "Engagement batch too large",
          413,
        );
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          throw new AppError(400, "Invalid engagement batch");
        }
        if (path[3] === "start") {
          const input = EngagementStartSchema.parse(value);
          const p = await rt.service.byToken(token, password);
          const started = await startEngagement(rt.repo, p, input);
          if (input.intent === "read")
            await rt.service.view(
              token,
              password,
              { actor: "client", ip: "", user_agent: "" },
              workspaceBrand?.engagement_notifications,
            );
          return json({
            ticket: started.ticket,
            targets: engagementTargets(p),
          });
        }
        const input = z
          .object({
            ticket: z.string().max(2000),
            snapshot: EngagementSnapshotSchema,
          })
          .strict()
          .parse(value);
        const p = await rt.repo.byToken(token);
        check(p, "Not found", 404);
        await recordEngagement(rt.repo, p, input.ticket, input.snapshot);
        return json({ accepted: true });
      }
      if (method === "GET" && !action)
        return json(clientResult(await rt.service.byToken(token, password)));
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
          clientResult(
            await rt.service.toggle(token, password, input, actor(req)),
          ),
        );
      }
      if (method === "POST" && action === "sign") {
        const p = await rt.service.byToken(token, password),
          input = SignatureSchema.parse(await body(req));
        return json(
          clientResult(
            await rt.service.sign(p.id, input, "client", actor(req), {
              token,
              password,
            }),
          ),
        );
      }
      if (method === "POST" && action === "decline") {
        const input = z
          .object({ note: z.string().max(2000).optional() })
          .parse(await body(req));
        return json(
          clientResult(
            await rt.service.decline(token, password, actor(req), input.note),
          ),
        );
      }
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
        const cutoff = new Date();
        cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
        await rt.repo.pruneEngagement(cutoff.toISOString());
        await refreshDueDocuments(rt.repo);
        await rt.service.tick();
        const [jobs] = await Promise.all([
          rt.worker.drain(),
          deliverQuestionMail(rt.repo, rt.mailer).catch(() => {
            console.error("Unable to drain proposal question mail");
          }),
        ]);
        results.push(jobs);
      }
      return json(results);
    }
    if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
      if (req.headers.get("authorization")) await staff(req);
      else check(sameOrigin(req), "Same-origin request required", 403);
      await revokeStaffSession(req);
      const response = clearStaffCookies(json({ signed_out: true }));
      return cookie(req, staffIdentityCookieName)
        ? clearStaffIdentity(response)
        : response;
    }
    const user = await staff(req);
    if (path.join("/") === "auth/staff-home-banner" && method === "POST") {
      check(sameOrigin(req), "Same-origin request required", 403);
      await dismissStaffHomeBanner(user);
      return json({ dismissed: true });
    }
    if (path[0] === "account" && path[1] === "security") {
      if (method !== "GET")
        check(sameOrigin(req), "Same-origin request required", 403);
      const identity = await staffSecurityIdentity(req);
      if (path.length === 2 && method === "GET")
        return json(await readStaffSecurity(identity));
      if (path[2] === "email" && path.length === 3) {
        if (method === "GET")
          return json(await staffPendingEmail(identity.user.id));
        if (method === "POST")
          return json(await staffEmailAction(identity, await body(req)));
      }
      if (path[2] === "two-step" && path.length === 3 && method === "POST")
        return json(await staffFactorAction(identity, await body(req)));
      if (path[2] === "password" && path.length === 3 && method === "POST") {
        const session = await changeSecurityPassword(
          req,
          identity,
          await body(req),
        );
        return setStaffCookies(json({ changed: true }), session);
      }
      if (path[2] === "sessions" && path.length === 3 && method === "POST") {
        const input = z
          .discriminatedUnion("action", [
            z.object({ action: z.literal("one"), id: z.uuid() }).strict(),
            z.object({ action: z.literal("others") }).strict(),
          ])
          .parse(await body(req));
        await manageStaffSessions(
          identity.user.id,
          identity.session,
          input.action,
          input.action === "one" ? input.id : null,
        );
        return json({ signed_out: true });
      }
      throw new AppError(404, "Security settings route not found");
    }
    const rt = await workspaceRuntime(user.workspace_id);
    if (path[0] === "account") {
      if (path.length === 1 && method === "GET")
        return json(await readStaffAccount(rt.repo, user));
      if (!["GET", "HEAD"].includes(method))
        check(sameOrigin(req), "Same-origin request required", 403);
      if (path.length === 1 && method === "PATCH") {
        const patch = StaffAccountPatchSchema.parse(await body(req));
        const account = await saveStaffAccount(rt.repo, user, patch);
        if (patch.first_name !== undefined || patch.last_name !== undefined)
          await workspaceEvent(rt.repo, user, "staff_profile_updated", {
            actor_name: [account.first_name, account.last_name]
              .filter(Boolean)
              .join(" "),
          });
        return json(account);
      }
      if (path[1] === "photo" && path.length === 2 && method === "POST") {
        const { image } = z
          .object({ image: z.string().max(1500000) })
          .strict()
          .parse(await body(req));
        return json(await saveStaffPhoto(rt.repo, rt.storage, user, image));
      }
      if (path[1] === "photo" && path.length === 2 && method === "DELETE")
        return json(
          await saveStaffAccount(rt.repo, user, { photo_path: null }),
        );
      if (path[1] === "photo" && path.length === 3 && method === "GET") {
        return new Response(
          Buffer.from(
            await staffPhoto(rt.repo, rt.storage, uuid.parse(path[2])),
          ),
          {
            headers: {
              ...headers,
              "Content-Type": "image/png",
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      }
      if (path[1] === "signature" && path.length === 2 && method === "POST") {
        const { version, image } = z
          .object({
            version: z.string().regex(/^[a-f0-9]{64}$/),
            image: z.string().max(500000),
          })
          .strict()
          .parse(await body(req));
        const result = await saveAccountSignature(
          rt.repo,
          user,
          version,
          image,
        );
        await workspaceEvent(rt.repo, user, "staff_signature_updated", {
          actor_name: user.staff_name,
        });
        return json(result);
      }
      throw new AppError(404, "Account settings route not found");
    }
    if (path[0] === "auth" && path[1] === "session" && method === "GET") {
      const settings =
        (await rt.repo.entities<WorkspaceSettings>("workspace_settings"))[0] ??
        null;
      const [account, members, photos] = await Promise.all([
        readStaffAccount(rt.repo, user),
        workspaceStaff(user.workspace_id),
        workspaceStaffPhotos(rt.repo),
      ]);
      return json({
        user,
        account,
        app_url: appOrigin(),
        settings: settings
          ? {
              ...WorkspaceSettingsSchema.parse(settings),
              default_password_hash: undefined,
              default_password_enabled: !!settings.default_password_hash,
            }
          : null,
        workspace_defaults: settings
          ? undefined
          : await workspaceDefaults(rt.repo, user),
        signatory_version: signatoryVersion(settings),
        staff: members.map((member) => ({
          ...member,
          photo_url: photos.get(member.user_id),
        })),
      });
    }
    if (
      path[0] === "workspace_settings" &&
      path[1] === "manual-invoicing" &&
      method === "POST"
    ) {
      check(sameOrigin(req), "Same-origin request required", 403);
      check(
        user.staff_role === "owner",
        "Only a super admin can choose manual invoicing",
        403,
      );
      const current =
        (await rt.repo.entities<WorkspaceSettings>("workspace_settings"))[0] ??
        (await workspaceDefaults(rt.repo, user));
      if (!current.qbo_manual_invoice) {
        await rt.repo.put("workspace_settings", {
          ...current,
          qbo_manual_invoice: true,
        });
        await workspaceEvent(rt.repo, user, "qbo_manual_invoicing_chosen", {});
      }
      return json({ manual: true });
    }
    if (path[0] === "email-templates") {
      if (method === "GET" && !path[1])
        return json(await emailTemplates(rt.repo));
      const key = path[1];
      if (method === "POST" && path[2] === "preview") {
        const { result, values, logo_error, p } = await emailStudioPreview(
          rt.repo,
          rt.storage,
          user,
          key,
          await body(req),
        );
        return json({
          ...result,
          values,
          logo_error,
          context: {
            client_name: `${p.client.first_name} ${p.client.last_name}`.trim(),
            client_email: p.client.email,
            sender_name: p.sender?.display_name ?? "",
            sender_email: p.sender?.email ?? "",
            workspace_name: p.workspace_settings?.company_name ?? "",
          },
        });
      }
      if (method === "POST" && path[2] === "test")
        return json(
          await sendEmailTest(
            rt.repo,
            rt.storage,
            rt.mailer,
            user,
            key,
            await body(req),
          ),
        );
      if (method === "POST" && path[2] === "reset") {
        z.object({})
          .strict()
          .parse(await body(req));
        return json(await saveEmailTemplate(rt.repo, user, key, {}, true));
      }
      if (method === "PUT" && path.length === 2)
        return json(
          await saveEmailTemplate(rt.repo, user, key, await body(req)),
        );
      throw new AppError(405, "Email template action unavailable");
    }
    if (path[0] === "workspace-fonts") {
      if (method === "POST") {
        return json(
          await uploadFont(rt.repo, rt.storage, user, await body(req)),
          201,
        );
      }
      const fonts = await uploadedFonts(rt.repo);
      if (!path[1]) return json(fonts);
      const font = fonts.find((f) => f.id === path[1]);
      check(font, "Font unavailable", 404);
      return new Response(
        Buffer.from(await readFont(rt.storage, font, rt.repo.workspaceId)),
        {
          headers: { ...headers, "Content-Type": `font/${font.format}` },
        },
      );
    }
    if (
      path[0] === "connections" &&
      path[2] === "activity" &&
      (path[1] === "qbo" || path[1] === "stripe") &&
      method === "GET"
    )
      return json(await providerActivity(rt.repo, path[1]));
    if (path[0] === "connections" && path[1] === "stripe" && path[2]) {
      check(
        user.staff_role === "owner",
        "Only a super admin can manage Stripe Connect.",
        403,
      );
      const connect = rt.stripeConnect;
      check(
        connect,
        "Stripe Connect test settings are unavailable for this workspace.",
        503,
      );
      if (path[2] === "callback" && method === "GET") {
        let destination = "/studio/connections/stripe";
        try {
          await connect.callback(
            user,
            new URL(req.url),
            cookie(req, stripeConnectCookie) ?? "",
          );
          afterResponse?.(() => connect.runSetup(user));
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          destination += "?connection=failed";
        }
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: destination,
            "Set-Cookie": connect.cookie("", 0),
          },
        });
      }
      if (method === "POST") {
        check(sameOrigin(req), "Same-origin request required", 403);
        if (path[2] === "authorize") {
          const input = z
            .object({ mode: z.literal("test") })
            .strict()
            .parse(await body(req));
          const started = await connect.authorize(
            user,
            new URL(req.url).origin,
            input.mode,
          );
          const response = json({ url: started.url });
          response.headers.append("Set-Cookie", started.cookie);
          return response;
        }
        if (path[2] === "setup") {
          if (afterResponse) afterResponse(() => connect.runSetup(user));
          else await connect.runSetup(user);
          return json(await connect.status(), 202);
        }
        if (path[2] === "disconnect") {
          await connect.disconnect(user);
          return json(await connect.status());
        }
      }
      throw new AppError(405, "Stripe connection action unavailable");
    }
    if (path[0] === "connections" && path[1] === "qbo") {
      const qbo = rt.worker.providers.qbo;
      if (path[2] === "items" || path[2] === "terms") {
        check(method === "GET", "Method not allowed", 405);
        check(
          qbo instanceof QboProvider,
          "Connect QuickBooks to choose items or terms.",
          409,
        );
        const ref = new URL(req.url).searchParams.get("ref");
        if (path[2] === "items" && ref) {
          check(
            /^(?:\d{1,30}:)?\d{1,30}$/.test(ref),
            "Invalid QuickBooks item.",
            400,
          );
          return json(await qbo.item(ref));
        }
        const search = new URL(req.url).searchParams.get("q")?.trim() ?? "";
        check(
          search.length <= 100 && !/[\x00-\x1f%_]/.test(search),
          "Enter a QuickBooks item name.",
          400,
        );
        return json(
          path[2] === "items" ? await qbo.items(search) : await qbo.terms(),
        );
      }
      check(
        user.staff_role === "owner",
        "Only a super admin can manage QuickBooks",
        403,
      );
      check(
        qbo instanceof QboProvider,
        "QuickBooks sandbox OAuth is not configured",
        503,
      );
      if (path[2] === "authorize" && method === "POST") {
        check(sameOrigin(req), "Same-origin request required", 403);
        const result = await qbo.connection.authorize(
          user.actor,
          new URL(req.url).origin,
        );
        const response = json({ url: result.url });
        response.headers.append("Set-Cookie", result.cookie);
        return response;
      }
      if (path[2] === "callback" && method === "GET") {
        await qbo.connection.callback(
          user.actor,
          new URL(req.url),
          cookie(req, QBO_STATE_COOKIE) ?? "",
        );
        await workspaceEvent(rt.repo, user, "qbo_connected", {
          actor_name: user.staff_name,
        });
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: "/studio/connections/quickbooks",
            "Set-Cookie": `${QBO_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=${QBO_CALLBACK}; Max-Age=0${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`,
          },
        });
      }
      if (path[2] === "refresh" && method === "POST") {
        check(sameOrigin(req), "Same-origin request required", 403);
        return json(await qbo.refreshConnection());
      }
      if (path[2] === "disconnect" && method === "POST") {
        check(sameOrigin(req), "Same-origin request required", 403);
        await qbo.connection.disconnect();
        await workspaceEvent(rt.repo, user, "qbo_disconnected", {});
        return json(await qbo.connection.status());
      }
      throw new AppError(405, "QuickBooks connection action unavailable");
    }
    if (path[0] === "connections" && method === "GET") {
      const qbo = rt.worker.providers.qbo;
      const qbo_connection =
        qbo instanceof QboProvider
          ? await qbo.connection.status()
          : {
              state: "not_connected",
              available: false,
              environment: "sandbox",
            };
      return json({
        stripe: rt.worker.providers.stripe instanceof StripeProvider,
        stripe_platform: rt.repo.workspaceId === LOCAL_WORKSPACE_ID,
        stripe_connect: await rt.stripeConnect?.status(),
        stripe_webhooks_configured:
          rt.repo.workspaceId === LOCAL_WORKSPACE_ID
            ? !!process.env.STRIPE_WEBHOOK_SECRET
            : !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
        qbo: qbo_connection.state === "connected",
        qbo_connection,
        email: !!process.env.RESEND_API_KEY,
        mock: process.env.APP_MODE === "local",
        mode:
          process.env.BILLING_MODE === "live"
            ? "live"
            : process.env.BILLING_MODE === "mock"
              ? "mock"
              : "test",
      });
    }
    if (path[0] === "team") {
      if (path[1] && path[2] === "proposals" && method === "GET")
        return json(
          await new ReassignmentService(rt.repo).work(
            user,
            uuid.parse(path[1]),
          ),
        );
      if (path[1] === "reassign" && method === "POST") {
        const result = await new ReassignmentService(rt.repo).reassign(
          user,
          await body(req),
        );
        return json(result);
      }

      if (method === "GET" && !path[1]) {
        if (process.env.APP_MODE === "local")
          return json({
            members: (await workspaceStaff(user.workspace_id)).map((m) => ({
              ...m,
              workspace_id: user.workspace_id,
              status: "active",
              last_sign_in_at: null,
            })),
            recent: [],
          });
        const team = teamService(user.workspace_id);
        const members = await team.list();
        const memberIds = members.map((member) => member.user_id);
        let enabled = new Set<string>();
        if (user.staff_role === "owner" && memberIds.length) {
          const result = await supabase()
            .from("staff_security")
            .select("user_id")
            .in("user_id", memberIds)
            .not("totp_secret", "is", null);
          check(!result.error, "Unable to load team security status", 503);
          enabled = new Set(result.data.map((row) => row.user_id));
        }
        return json({
          members:
            user.staff_role === "owner"
              ? members.map((member) => ({
                  ...member,
                  two_step_enabled: enabled.has(member.user_id),
                }))
              : members,
          recent: await team.store.audit(
            new URL(req.url).searchParams.get("history") === "all",
          ),
        });
      }
      if (method === "POST" && path[1] === "invite")
        return json(
          await teamService(user.workspace_id).invite(user, await body(req)),
          201,
        );
      if (method === "POST" && path[1]) {
        const input = await body(req),
          id = uuid.parse(path[1]);
        if (
          process.env.APP_MODE === "local" &&
          typeof input.display_name === "string" &&
          (!input.action || input.action === "name")
        ) {
          const updated = await updateStaffDisplayName(
            user,
            id,
            input.display_name,
          );
          await workspaceEvent(rt.repo, user, "team_updated", {
            user_id: id,
            name: input.display_name,
          });
          return json(updated);
        }
        return json(
          await teamService(user.workspace_id).change(
            user,
            id,
            input.action ? input : { action: "name", ...input },
          ),
        );
      }
      throw new AppError(405, "Team action unavailable");
    }
    if (path[0] === "workspace-icon") {
      if (method === "POST") {
        check(
          user.staff_role === "owner",
          "Only a super admin can change the logo icon",
          403,
        );
        return json({
          icon: await uploadWorkspaceIcon(
            rt.storage,
            rt.repo.workspaceId,
            await body(req),
          ),
        });
      }
      if (method === "GET") {
        const settings = (
          await rt.repo.entities<WorkspaceSettings>("workspace_settings")
        )[0];
        return new Response(
          Buffer.from(
            await readWorkspaceIcon(
              rt.storage,
              rt.repo.workspaceId,
              settings?.logo_icon,
              iconRequestSize(req, 128),
            ),
          ),
          { headers: { ...headers, "Content-Type": "image/png" } },
        );
      }
    }
    if (path[0] === "cover-image" && method === "POST")
      return json(await validateCoverImage((await body(req)).image));
    if (path[0] === "workspace-palette" && method === "GET") {
      const settings = (
        await rt.repo.entities<WorkspaceSettings>("workspace_settings")
      )[0];
      check(
        settings?.logo && settings.logo.startsWith(rt.repo.workspaceId + "/"),
        "Upload a logo first",
      );
      return json({
        colors: await extractBrandPalette(await rt.storage.get(settings.logo)),
      });
    }
    if (path[0] === "workspace-logo") {
      if (method === "POST") {
        check(
          user.staff_role === "owner",
          "Only a super admin can change the workspace logo",
          403,
        );
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
        return json({
          path,
          palette_suggestions: await extractBrandPalette(bytes),
        });
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
        const result = await syncStripeCatalog(
          rt.repo,
          rt.worker.providers.stripe.api,
        );
        await workspaceEvent(rt.repo, user, "catalog_synced", {
          provider: "stripe",
          ...result,
        });
        return json(result);
      }
      check(
        provider === "qbo" && rt.worker.providers.qbo instanceof QboProvider,
        "QuickBooks sandbox credentials required",
        503,
      );
      return json({ items: await rt.worker.providers.qbo.items("") });
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

    if (path[0] === "workspace_documents") {
      if (method === "GET") return json(await documents(rt.repo));
      if (method === "POST" && path[2] === "refresh")
        return json(await refreshDocument(rt.repo, uuid.parse(path[1])));
      if (method === "POST" || method === "PUT")
        return json(await saveDocument(rt.repo, await body(req)), 201);
    }

    if (
      method === "POST" &&
      path[0] === "clients" &&
      path[2] === "stripe-customer"
    ) {
      const input = z
        .object({
          customer_id: z.string().nullable(),
          expected_customer_id: z.string().nullable(),
        })
        .strict()
        .parse(await body(req));
      return json(
        await linkStripeCustomer(
          rt.repo,
          uuid.parse(path[1]),
          input.customer_id,
          input.expected_customer_id,
          user,
          rt.worker.providers.stripe instanceof StripeProvider
            ? rt.worker.providers.stripe.api
            : undefined,
        ),
      );
    }
    if (method === "GET" && path[0] === "clients" && path[2] === "billing") {
      const client = (
        await rt.repo.entities<import("./model").Client>("clients")
      ).find((c) => c.id === uuid.parse(path[1]));
      check(client, "Client not found", 404);
      return json(
        await clientBilling(
          rt.repo,
          client,
          rt.worker.providers.stripe instanceof StripeProvider
            ? rt.worker.providers.stripe.api
            : undefined,
        ),
      );
    }
    if (
      method === "POST" &&
      path[0] === "studio-history" &&
      path[1] &&
      path[2] === "restore"
    )
      return json(
        await restoreConnectorChange(rt.repo, uuid.parse(path[1]), user),
      );
    if (method === "GET" && path[0] === "workspace_events") {
      const query = new URL(req.url).searchParams;
      const rows = (
        await connectorActivityViews(rt.repo, await activity(rt.repo), user)
      ).filter(
        (e) =>
          (!query.get("actor") || query.get("actor") === e.actor) &&
          (!query.get("type") || query.get("type") === e.type) &&
          (!query.get("since") || e.created_at >= query.get("since")!),
      );
      if (query.get("format") === "csv")
        return new Response(activityCsv(rows), {
          headers: {
            ...headers,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="workspace-activity.csv"',
          },
        });
      return json(rows);
    }
    if (method === "POST" && path[0] === "document-preview") {
      const input = z
        .object({
          id: uuid,
          content: z.array(z.record(z.string(), z.unknown())).max(300),
          quote: QuoteSchema,
          header_footer: TemplateBandsSchema.optional(),
          cover: CoverSchema.optional(),
          style_overrides: StyleOverridesSchema.optional(),
          pagination: PagePlanSchema.optional(),
        })
        .strict()
        .parse(await body(req));
      const settings = (
        await rt.repo.entities<WorkspaceSettings>("workspace_settings")
      )[0];
      check(settings, "Workspace settings required");
      return json(
        await pdfPreview(
          rt.repo,
          rt.storage,
          authoringPreview(
            {
              ...input,
              content: reviewBlocks(input.content as Block[], false),
            },
            settings,
            rt.repo.workspaceId,
          ),
          settings,
        ),
      );
    }
    if (method === "DELETE" && path[0] === "clients" && path[1]) {
      await rt.repo.deleteClient(uuid.parse(path[1]), user);
      return json({ deleted: true });
    }
    if (method === "DELETE" && path[0] === "content_library" && path[1]) {
      const id = uuid.parse(path[1]);
      const item = (await rt.repo.entities<SavedBlock>("content_library")).find(
        (v) => v.id === id,
      );
      check(item, "Saved block not found", 404);
      check(
        await rt.repo.commitLinkedBlock(
          await prepareLinkedSave(rt.repo, item, null, user),
          {
            id: crypto.randomUUID(),
            ...user,
            type: "content_library_deleted",
            created_at: new Date().toISOString(),
            metadata: { name: item.name, entity_id: id },
          },
        ),
        "Saved block changed; reload before deleting",
        409,
      );
      return json({ deleted: true });
    }
    if (path[0] === "templates" && path[1]) {
      if (method === "DELETE") {
        const template = (
          await rt.repo.entities<import("./model").Template>("templates")
        ).find((t) => t.id === path[1]);
        check(
          !template?.starter_key,
          "Starters cannot be deleted. Hide from new proposals instead.",
          403,
        );
        check(template?.sample, "Template deletion unavailable", 405);
        check(
          user.staff_role === "owner",
          "Only a super admin can delete samples",
          403,
        );
        check(sameOrigin(req), "Same-origin request required", 403);
        check(
          await rt.repo.removeSampleTemplate(template.id),
          "Sample template not found",
          404,
        );
        await workspaceEvent(rt.repo, user, "template_deleted", {
          name: template.name,
          entity_id: template.id,
        });
        return json({ deleted: true });
      }
      if (method === "POST" && path[2])
        return json(
          await libraryStarterAction(
            rt.repo,
            user,
            path[1],
            path[2],
            await body(req),
          ),
        );
    }
    if (
      [
        "clients",
        "pricing_items",
        "templates",
        "content_library",
        "workspace_settings",
        "custom_families",
      ].includes(path[0])
    ) {
      const table = path[0] as EntityTable;
      if (method === "GET") {
        let entities = await rt.repo.entities<Record<string, unknown>>(table);
        if (table === "templates") {
          entities.sort(
            (a, b) =>
              Number(a.starter_order ?? 999) - Number(b.starter_order ?? 999),
          );
          for (let index = 0; index < entities.length; index++) {
            const e = entities[index];
            if (!e.signature_heading_defaulted) {
              const next = {
                ...e,
                content: withSignatureHeadings(e.content as Block[]),
                signature_heading_defaulted: true,
              } as Record<string, unknown>;
              delete next.pagination;
              const audit = {
                id: randomUUID(),
                ...user,
                type: "template_defaults_updated",
                created_at: new Date().toISOString(),
                metadata: { entity_id: e.id, name: e.name },
              };
              const changed = e.starter_key
                ? await rt.repo.replaceStarter(
                    e as unknown as import("./model").Template,
                    next as unknown as import("./model").Template,
                    audit,
                  )
                : await rt.repo.saveStudioEntity(
                    "templates",
                    e as { id: string },
                    next as { id: string },
                    audit,
                  );
              if (changed) entities[index] = next;
              else {
                // A read-time legacy upgrade must never overwrite a newer edit.
                const current = (
                  await rt.repo.entities<Record<string, unknown>>("templates")
                ).find((row) => row.id === e.id);
                if (current) entities[index] = current;
                else entities.splice(index--, 1);
              }
            }
          }
        }
        if (table === "templates")
          entities = await libraryTemplates(
            rt.repo,
            entities as import("./model").Template[],
          );
        if (table === "templates" || table === "content_library")
          entities = await studioEntityViews(
            rt.repo,
            table,
            entities as { id: string }[],
            user,
          );
        if (table === "content_library")
          entities = await savedBlockViews(rt.repo, entities as SavedBlock[]);
        return json(
          table === "workspace_settings"
            ? entities.map((e) => ({
                ...e,
                default_password_hash: undefined,
                default_password_enabled: !!e.default_password_hash,
              }))
            : table === "templates"
              ? entities.map((e) => ({
                  ...e,
                  header_footer: TemplateBandsSchema.parse(
                    e.header_footer ?? defaultTemplateBands(),
                  ),
                  cover: loadedCover(
                    e.cover === undefined
                      ? undefined
                      : CoverSchema.parse(e.cover),
                  ),
                }))
              : entities,
        );
      }
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
          entity.qbo_manual_invoice = previous?.qbo_manual_invoice;
          const qboDeliveryChanged =
            (entity.qbo_invoice_delivery ?? "draft") !==
            (previous?.qbo_invoice_delivery ?? "draft");
          if (
            qboDeliveryChanged ||
            entity.qbo_custom_item_ref !==
              (previous?.qbo_custom_item_ref ?? null) ||
            (entity.qbo_term_ref ?? null) !== (previous?.qbo_term_ref ?? null)
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change QuickBooks billing defaults",
              403,
            );
          if (
            (entity.payment_methods ?? "card") !==
            (previous?.payment_methods ?? "card")
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change payment methods",
              403,
            );
          if (
            JSON.stringify(entity.brand_palette ?? []) !==
            JSON.stringify(previous?.brand_palette ?? [])
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change the brand palette",
              403,
            );
          if (
            JSON.stringify(entity.business_state ?? null) !==
            JSON.stringify(previous?.business_state ?? null)
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change Business state",
              403,
            );
          if (
            JSON.stringify(entity.logo_icon ?? null) !==
            JSON.stringify(previous?.logo_icon ?? null)
          ) {
            check(
              user.staff_role === "owner",
              "Only a super admin can change the logo icon",
              403,
            );
            if (entity.logo_icon) {
              workspaceIconPath(
                entity.logo_icon.path,
                rt.repo.workspaceId,
                128,
              );
              await readWorkspaceIcon(
                rt.storage,
                rt.repo.workspaceId,
                entity.logo_icon,
                128,
              );
            }
          }
          entity.default_password_hash =
            previous?.default_password_hash ?? null;
          if (raw.default_password !== undefined) {
            check(
              user.staff_role === "owner",
              "Only a super admin can change the default password",
              403,
            );
            check(
              raw.default_password === null ||
                typeof raw.default_password === "string",
              "Invalid default password",
            );
            entity.default_password_hash =
              raw.default_password === null
                ? null
                : hashPassword(raw.default_password);
          }
          delete entity.default_password_enabled;
          await validateFonts(rt.repo, entity.proposal_fonts);
          await validateStyles(rt.repo, entity);
          if (entity.show_powered_by !== (previous?.show_powered_by ?? true))
            check(
              user.staff_role === "owner",
              "Only a super admin can change Yeswell attribution",
              403,
            );
          if (
            (entity.question_notify_admins ?? false) !==
            (previous?.question_notify_admins ?? false)
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change question notifications",
              403,
            );
          if (
            JSON.stringify(entity.engagement_notifications) !==
            JSON.stringify(previous?.engagement_notifications)
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change engagement notifications",
              403,
            );
          if (
            entity.email_reply_to !== previous?.email_reply_to ||
            JSON.stringify(entity.reminder_rules) !==
              JSON.stringify(previous?.reminder_rules) ||
            JSON.stringify(entity.countersign_reminder) !==
              JSON.stringify(previous?.countersign_reminder)
          )
            check(
              user.staff_role === "owner",
              "Only a super admin can change email reminder rules",
              403,
            );
          if (entity.sending_domain !== (previous?.sending_domain ?? ""))
            check(
              user.staff_role === "owner",
              "Only a super admin can change the verified sending domain",
              403,
            );
          if (
            JSON.stringify(entity.company_signatory ?? null) !==
            JSON.stringify(previous?.company_signatory ?? null)
          ) {
            check(
              user.staff_role === "owner",
              "Only a super admin can change company signatory settings",
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
          if (qboDeliveryChanged) {
            await rt.repo.put("workspace_settings", entity);
            await workspaceEvent(
              rt.repo,
              user,
              "qbo_invoice_delivery_changed",
              {
                delivery: entity.qbo_invoice_delivery ?? "draft",
              },
            );
            return json({ ...entity, default_password_hash: undefined }, 201);
          }
        } else if (table === "custom_families") {
          throw new AppError(
            405,
            "Create custom families through the verified Stripe action",
          );
        } else if (table === "clients") {
          const previous = (
            await rt.repo.entities<import("./model").Client>("clients")
          ).find((c) => c.id === raw.id);
          check(
            (raw.stripe_customer_id ?? null) ===
              (previous?.stripe_customer_id ?? null),
            "Choose a Stripe customer from How they’re billed on the client page",
          );
          const client = await rt.service.updateClient(raw, user);
          await workspaceEvent(rt.repo, user, "client_saved", {
            name: client.company,
            client_id: client.id,
          });
          return json(client, 201);
        } else if (table === "pricing_items") entity = ItemSchema.parse(raw);
        else if (table === "templates") {
          const existing = (
            await rt.repo.entities<import("./model").Template>("templates")
          ).find((t) => t.id === raw.id);
          check(
            !existing?.starter_key,
            "This is a Yeswell starter. Make a copy to customize it.",
            403,
          );
          entity = TemplateInputSchema.parse(raw);
          entity.content = reviewBlocks(
            contentAfterCover(entity.content as Block[]),
            false,
          );
          const savedTemplateId = entity.id;
          const previousTemplate = (
            await rt.repo.entities<import("./model").Template>("templates")
          ).find((t) => t.id === savedTemplateId);
          entity.sample = previousTemplate?.sample;
          delete entity.connector_created;
          if (previousTemplate?.connector_created)
            entity.connector_created = true;
          delete entity.starter_key;
          delete entity.starter_order;
          delete entity.source_starter_key;
          if (previousTemplate?.source_starter_key)
            entity.source_starter_key = previousTemplate.source_starter_key;
          if (previousTemplate?.starter_key) {
            entity.starter_key = previousTemplate.starter_key;
            entity.starter_order = previousTemplate.starter_order;
          }
          if (
            !entity.signature_heading_defaulted &&
            !previousTemplate?.signature_heading_defaulted
          )
            entity.content = withSignatureHeadings(entity.content as Block[]);
          entity.signature_heading_defaulted = true;
          entity.cover = entity.cover
            ? loadedCover(entity.cover)
            : previousTemplate
              ? loadedCover(previousTemplate.cover)
              : defaultCover(true);
          await validateStyles(
            rt.repo,
            (
              await rt.repo.entities<WorkspaceSettings>("workspace_settings")
            )[0],
            entity.style_overrides,
          );
        } else
          entity = z
            .object({
              id: uuid,
              name: z.string().min(1).max(200),
              block: z.record(z.string(), z.unknown()),
              type: z.literal("group").optional(),
              blocks: z
                .array(z.record(z.string(), z.unknown()))
                .min(1)
                .max(300)
                .optional(),
            })
            .parse(raw);
        if (table === "templates" || table === "content_library") {
          const before =
            (await rt.repo.entities<{ id: string }>(table)).find(
              (row) => row.id === entity.id,
            ) ?? null;
          const expected = raw.expected_revision ?? raw.revision;
          if (expected !== undefined)
            z.string()
              .regex(/^[a-f0-9]{64}$/)
              .parse(expected);
          return json(
            await writeStudioEntity(rt.repo, table, before, entity, user, {
              revision: expected,
              updateDrafts:
                table === "content_library" && raw.update_drafts === true,
              draftIds:
                table === "content_library" && raw.update_drafts === true
                  ? z.array(uuid).max(1000).parse(raw.update_draft_ids)
                  : undefined,
            }),
            201,
          );
        }
        await rt.repo.put(table, entity);
        await workspaceEvent(rt.repo, user, `${table}_saved`, {
          name:
            "name" in entity
              ? entity.name
              : "company_name" in entity
                ? entity.company_name
                : table,
          entity_id: entity.id,
        });
        return json(
          table === "workspace_settings"
            ? { ...entity, default_password_hash: undefined }
            : entity,
          201,
        );
      }
    }
    if (path[0] === "engagement" && method === "GET") {
      return json(
        Object.fromEntries(
          (
            await rt.repo.entities<import("./engagement").EngagementAggregate>(
              "proposal_engagement_totals",
            )
          )
            .filter((a) => a.views > 0)
            .map((a) => [a.id, publicEngagement(a)]),
        ),
      );
    }
    if (
      path[0] === "reports" &&
      method === "GET" &&
      !path[2] &&
      (!path[1] || path[1] === "export")
    ) {
      const query = new URL(req.url).searchParams;
      const report = await readReport(rt.repo, query, user);
      if (!path[1]) return json(report);
      return new Response(
        reportCsv(
          report,
          reportExportSort(query, "template"),
          reportExportSort(query, "owner"),
        ),
        {
          headers: {
            ...headers,
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="yeswell-reports.csv"',
          },
        },
      );
    }
    if (path[0] === "proposals") {
      const id = path[1],
        action = path[2];
      if (method === "GET" && !id) {
        const q = new URL(req.url).searchParams;
        const offset = Math.max(0, Number(q.get("offset")) || 0),
          limit = Math.min(100, Math.max(1, Number(q.get("limit")) || 50));
        const drill = q.has("report")
          ? await reportDrilldown(rt.repo, q)
          : null;
        const list = drill
          ? []
          : (await rt.repo.list(q.get("q") ?? undefined)).filter(
              (p) =>
                (!q.get("owner") ||
                  q.get("owner") === "all" ||
                  proposalOwnerId(p) ===
                    (q.get("owner") === "mine"
                      ? user.actor.slice(6)
                      : q.get("owner"))) &&
                (!q.get("status") || p.status === q.get("status")) &&
                (!q.get("client") || p.client.id === q.get("client")) &&
                (!q.get("source") || p.source === q.get("source")) &&
                (!q.get("from") || p.created_at >= q.get("from")!) &&
                (!q.get("to") || p.created_at <= q.get("to")!),
            );
        const page = drill
          ? await rt.repo.reportPage(drill.ids.slice(offset, offset + limit))
          : list.slice(offset, offset + limit);
        const questions = await rt.repo.questionCounts(
          page.filter((p) => p.token).map((p) => p.id),
          user.actor.slice(6),
        );
        return json({
          total: drill?.ids.length ?? list.length,
          items: page.map((p) => ({
            ...(questions[p.id] ? { question_summary: questions[p.id] } : {}),
            ...p,
            content: [],
            version_count: p.versions.length,
            versions: [],
            events: p.events.filter((e) =>
              ["viewed", "marked_won", "marked_lost"].includes(e.type),
            ),
          })),
        });
      }
      if (method === "POST" && !id) {
        const input = z
          .object({
            client_id: uuid,
            template_id: uuid,
            title: z.string().min(1).max(300),
            valid_until: z.string().nullable().optional(),
            currency: z.string().length(3).optional(),
            password: z.string().min(8).max(200).optional(),
            playbook: PlaybookDraftSchema.optional(),
          })
          .parse(await body(req));
        return json(await rt.service.create(input, user), 201);
      }
      uuid.parse(id);
      if (method === "POST" && action === "replace-saved-block") {
        const input = z
          .object({ revision: z.number().int(), saved_block_id: uuid })
          .strict()
          .parse(await body(req));
        return json(
          await rt.service.replaceSavedBlock(
            id,
            input.revision,
            input.saved_block_id,
            user,
          ),
        );
      }
      if (["GET", "POST"].includes(method) && action === "preview-pdf") {
        const stored = await rt.repo.get(id);
        check(stored, "Not found", 404);
        const settings = (
          await rt.repo.entities<WorkspaceSettings>("workspace_settings")
        )[0];
        check(settings, "Workspace settings required");
        let p = stored;
        if (method === "POST") {
          const input = z
            .object({
              revision: z.number().int(),
              title: z.string().min(1).max(300),
              content: z.array(z.record(z.string(), z.unknown())).max(300),
              quote: QuoteSchema,
              valid_until: z.string().nullable(),
              header_footer: HeaderFooterSettingsSchema.optional(),
              cover: CoverSchema.optional(),
              style_overrides: StyleOverridesSchema.optional(),
              pagination: PagePlanSchema.optional(),
              template_style_overrides: StyleOverridesSchema.optional(),
            })
            .strict()
            .parse(await body(req));
          check(
            stored.revision === input.revision,
            "Proposal changed; reload",
            409,
          );
          check(
            !stored.archived_at && stored.source === "native",
            "Archived and imported proposals are read-only",
            409,
          );
          p = stored.signers.length
            ? stored
            : {
                ...stored,
                ...input,
                content: reviewBlocks(input.content as Block[], false),
              };
        }
        const result = await pdfPreview(rt.repo, rt.storage, p, settings);
        if (method === "POST") return json(result);
        return new Response(Buffer.from(result.pdf_base64, "base64"), {
          headers: {
            ...headers,
            "Content-Type": "application/pdf",
            "Content-Disposition": 'inline; filename="proposal-preview.pdf"',
            "Cache-Control": "private, no-store",
          },
        });
      }
      if (method === "GET" && ["preview", "preview-logo"].includes(action)) {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        const settings = (
          await rt.repo.entities<WorkspaceSettings>("workspace_settings")
        )[0];
        check(settings, "Workspace settings required");
        if (action === "preview-logo") {
          const logo = (
            p.status === "draft" ? settings : (p.workspace_settings ?? settings)
          ).logo;
          check(
            logo && logo.startsWith(rt.repo.workspaceId + "/"),
            "Logo unavailable",
            404,
          );
          return new Response(Buffer.from(await rt.storage.get(logo)), {
            headers: { ...headers, "Content-Type": "image/png" },
          });
        }
        const preview = previewResult(p, settings);
        return json({
          ...preview,
          company: {
            ...preview.company,
            logo_icon: settings.logo_icon
              ? sha256(settings.logo_icon.path).slice(0, 16)
              : null,
          },
        });
      }
      if (action === "questions") {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        if (method === "GET" && !path[3])
          return json(await staffQuestions(rt.repo, p, user));
        if (method === "POST" && path[3] && !path[4]) {
          const input = StaffQuestionSchema.parse(await body(req));
          await changeQuestion(rt.repo, p, uuid.parse(path[3]), input, user);
          return json(await staffQuestions(rt.repo, p, user));
        }
      }
      if (method === "GET" && action === "engagement") {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        return json(await engagementReport(rt.repo, p));
      }
      if (method === "GET" && !action) {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        return json(await rt.service.forRead(p));
      }
      if (method === "POST" && action === "reassign") {
        const input = z
          .object({
            user_id: uuid,
            revision: z.number().int().nonnegative(),
            notify: z.boolean().default(true),
          })
          .strict()
          .parse(await body(req));
        const result = await new ReassignmentService(rt.repo).reassign(user, {
          user_id: input.user_id,
          notify: input.notify,
          proposals: [{ id, revision: input.revision }],
        });
        return json(
          await rt.service.forRead(result[0] ?? (await rt.repo.get(id))!),
        );
      }
      if (method === "PATCH" && !action) {
        const input = z
          .object({
            revision: z.number().int(),
            header_footer: HeaderFooterSettingsSchema.optional(),
            cover: CoverSchema.optional(),
            style_overrides: StyleOverridesSchema.optional(),
            pagination: PagePlanSchema.optional(),
            template_style_overrides: StyleOverridesSchema.optional(),
            title: z.string().min(1).max(300).optional(),
            content: z
              .array(z.record(z.string(), z.unknown()))
              .max(300)
              .optional(),
            quote: QuoteSchema.optional(),
            valid_until: z.string().nullable().optional(),
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
      if (method === "POST" && action === "review") {
        const input = z
          .object({
            revision: z.number().int(),
            section_ids: z.array(z.string().min(1)).min(1).max(300),
            reviewed: z.boolean(),
          })
          .parse(await body(req));
        return json(await rt.service.reviewSections(id, input, user));
      }
      if (method === "GET" && action === "ready") {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        return json(await rt.service.checkReady(p));
      }
      if (method === "GET" && action === "emails")
        return json(await proposalEmailLog(rt.repo, id));
      if (method === "POST" && action === "reminders") {
        const input = z
          .object({
            revision: z.number().int().nonnegative(),
            enabled: z.boolean(),
          })
          .strict()
          .parse(await body(req));
        return json(
          await rt.service.setAutomaticReminders(
            id,
            input.revision,
            input.enabled,
            user,
          ),
        );
      }
      if (method === "POST" && action === "send") {
        const input = req.headers
          .get("content-type")
          ?.includes("application/json")
          ? await body(req)
          : {};
        const delivery = z
          .enum(["email", "manual"])
          .default("email")
          .parse(input.delivery_method);
        return json(
          await rt.service.send(
            id,
            user,
            input.confirm_ai_review === true,
            input.sender_user_id === undefined
              ? undefined
              : uuid.parse(input.sender_user_id),
            {
              delivery_method: delivery,
              pagination: PagePlanSchema.optional().parse(input.pagination),
              expected_revision: z
                .number()
                .int()
                .min(0)
                .optional()
                .parse(input.revision),
              note:
                delivery === "email"
                  ? z.string().max(4000).optional().parse(input.note)
                  : undefined,
              subject:
                delivery === "email"
                  ? z.string().max(300).optional().parse(input.subject)
                  : undefined,
              body: delivery === "email" ? input.body : undefined,
              password: z
                .string()
                .min(8)
                .max(200)
                .nullable()
                .optional()
                .parse(input.password),
            },
          ),
        );
      }
      if (method === "GET" && action === "download") {
        let p = await rt.repo.get(id);
        check(p, "Not found", 404);
        let file = p.files.findLast(
          (f) => f.kind === "sealed" || f.kind === "import",
        );
        if (!file || (!p.client_signed_at && p.source === "native")) {
          p = await proposalAction(
            rt.repo,
            id,
            p.revision,
            "preview_pdf",
            user,
          );
          const stage = p.jobs.findLast(
            (j) => j.kind === "pdf" && j.payload.preview,
          )?.payload.stage;
          await rt.worker.drain(id, "pdf");
          p = (await rt.repo.get(id))!;
          file = p.files.findLast((f) => f.stage === stage && !!f.version_hash);
        }
        check(file, "PDF is being prepared; retry shortly", 503);
        return new Response(
          Buffer.from(await rt.storage.get(file.storage_path)),
          {
            headers: {
              ...headers,
              "Content-Type": "application/pdf",
              "Content-Disposition": 'attachment; filename="proposal.pdf"',
            },
          },
        );
      }
      if (method === "POST" && action === "actions") {
        const input = z
          .object({
            revision: z.number().int(),
            action: z.enum(proposalActions),
            note: z.string().max(4000).default(""),
          })
          .parse(await body(req));
        return json(
          await proposalAction(
            rt.repo,
            id,
            input.revision,
            input.action,
            user,
            input.note,
            new Date(),
            rt.service,
          ),
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
      if (action === "quickbooks" && (method === "GET" || method === "POST")) {
        const p = await rt.repo.get(id);
        check(p, "Not found", 404);
        const link = p.billing_links.find((l) => l.provider === "qbo");
        const client = (
          await rt.repo.entities<import("./model").Client>("clients")
        ).find((c) => c.id === p.client.id);
        const email = qboBillingEmail({
          ...p.client,
          billing_email: client ? client.billing_email : p.client.billing_email,
        });
        const qbo = rt.worker.providers.qbo;
        if (method === "POST") {
          check(
            !waitingForInvoiceCountersignature(p),
            "Waiting for countersignature",
            409,
          );
          check(sameOrigin(req), "Same-origin request required", 403);
          check(
            qbo instanceof QboProvider,
            "Reconnect QuickBooks to choose a customer.",
            409,
          );
          const { customer } = z
            .object({ customer: z.string().regex(/^\d+$/).nullable() })
            .strict()
            .parse(await body(req));
          const status = await qbo.connection.status();
          const candidates = link?.metadata?.customer_candidates as
            { id: string }[] | undefined;
          check(
            link &&
              quickBooksCustomerReview(link) &&
              status.state === "connected" &&
              status.realm === link.metadata?.realm &&
              link.metadata?.billing_email === email &&
              (customer === null
                ? link.metadata.customer_review_reason === "name" ||
                  link.metadata.customer_review_reason === "company"
                : candidates?.some((c) => c.id === customer)),
            "Refresh the record to review the current QuickBooks matches.",
            409,
          );
          await mutate(rt.repo, id, (proposal) => {
            const current = proposal.billing_links.find(
              (l) => l.provider === "qbo",
            );
            check(
              current?.status === "needs_review" &&
                JSON.stringify(current.metadata) ===
                  JSON.stringify(link?.metadata),
              "The billing record changed. Refresh and try again.",
              409,
            );
            current.metadata = {
              ...current.metadata,
              customer_choice: { id: customer, realm: status.realm, email },
            };
            event(
              proposal,
              customer === null
                ? "qbo_customer_creation_requested"
                : "qbo_customer_chosen",
              user,
              customer === null ? {} : { customer },
            );
          });
          await rt.worker.retry(id);
          return json(await rt.worker.drain(id));
        }
        let invoice = link?.metadata?.invoice;
        let refresh_error: string | undefined;
        if (
          qbo instanceof QboProvider &&
          link?.external_object_id &&
          typeof link.metadata?.realm === "string" &&
          !link.metadata?.manual_invoice
        ) {
          try {
            invoice = await qbo.invoice(
              link.external_object_id,
              link.metadata.realm,
            );
          } catch (error) {
            refresh_error =
              error instanceof AppError
                ? error.message
                : "Could not refresh the QuickBooks invoice.";
          }
        }
        return json({
          email: link?.metadata?.billing_email ?? email,
          reference: proposalInvoiceRef(p.id),
          invoice,
          refresh_error,
        });
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
    if (e instanceof TeamWorkConflict)
      return json({ error: e.message, unfinished_proposals: e.proposals }, 409);
    if (e instanceof DuplicateClient)
      return json({ error: e.message, existing_client: e.existing }, 409);
    if (
      e instanceof AppError &&
      e.status === 429 &&
      path[0] === "public" &&
      ["engagement", "questions"].includes(path[2])
    )
      return new Response(JSON.stringify({ error: e.message }), {
        status: 429,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Retry-After": path[2] === "questions" ? "3600" : "600",
        },
      });
    if (e instanceof AppError)
      return json(
        {
          error: e.message,
          ...(e instanceof StaffSecurityRequired ? { state: e.state } : {}),
          ...(e instanceof StaffSessionExpired ||
          e instanceof StaffPasswordRequired
            ? { code: e.code }
            : {}),
        },
        e.status,
      );
    if (e instanceof z.ZodError) {
      const hints: Record<string, string> = {
        timezone: "Enter a timezone such as America/New_York.",
        reminder_days: "Use up to 10 positive whole numbers for reminder days.",
        default_validity_days:
          "Link validity must be a whole number from 1 to 365 days.",
        sending_domain:
          "Enter a domain such as example.com, without a URL or email address.",
        consent_text:
          "Electronic signature consent must have at least 20 characters.",
        email: "Enter a valid contact email.",
        company_signatory:
          "Check the signatory name, title, staff account and signature image.",
        company_name: "Enter the workspace name.",
        proposal_fonts: "Choose a font from this workspace.",
        currency: "Choose one of the supported currencies.",
      };
      return json(
        {
          error:
            path[0] === "workspace_settings"
              ? (hints[String(e.issues[0]?.path[0])] ??
                "Check the workspace fields and try saving again.")
              : "Invalid request",
          issues: e.issues,
        },
        400,
      );
    }
    console.error(
      "Request failed",
      e instanceof Error ? e.message : "Unknown error",
    );
    return json({ error: "Internal service error" }, 500);
  }
}
