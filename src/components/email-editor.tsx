"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import type { Data } from "./staff-app";
import type { RichText } from "../lib/model";
import { api, post, Button, Banner, Icon } from "./ui";
import { Skeleton, Sheet } from "./foundation";
import { DialogActions } from "./dialog-actions";
import {
  BlockScope,
  EditorControlConfig,
  useBlockToolbar,
  useBlockSelection,
} from "./block-controls";
import { EditorHeader, useCurrentState } from "./editor-header";
import { useSessionHistory } from "./editor-history";
import { EditBar } from "./editor/edit-bar";
import { ToolsPanel } from "./editor/tools-panel";
import { FieldEditor } from "./field-editor";
import { FieldOptions } from "./field-options";
import { FormattingControls } from "./formatting-controls";
import { ToolbarPopover } from "./toolbar-popover";
import { ToastSurface } from "./toast-surface";
import { blockText } from "../lib/editor-document";
import {
  emailFields,
  editableEmail,
  validateTemplate,
  plainBody,
  type EmailTemplate,
} from "../lib/email-template-content";
import {
  emailPickerFields,
  emailButtonCaption,
  emailAttachments,
  emailIsDefault,
} from "../lib/email-editor";
import { emailWhen, studioDate } from "../lib/studio-v3";
import { EmailCanvas } from "./email-canvas";

type Draft = Pick<EmailTemplate, "subject" | "body" | "button_label">;
const draftOf = (t: Draft): Draft => ({
  subject: t.subject,
  body: t.body,
  button_label: t.button_label,
});
const equal = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);
type Preview = {
  subject: string;
  html: string;
  text: string;
  values: Record<string, string>;
  logo_error?: string;
  context?: {
    client_name: string;
    client_email: string;
    sender_name: string;
    sender_email: string;
    workspace_name: string;
  };
};
export function EmailEditor(props: {
  data: Data;
  initial: EmailTemplate;
  saved: (t: EmailTemplate) => void;
}) {
  return (
    <BlockScope>
      <InlineEmailEditor {...props} />
    </BlockScope>
  );
}
function InlineEmailEditor({
  data,
  initial,
  saved,
}: {
  data: Data;
  initial: EmailTemplate;
  saved: (t: EmailTemplate) => void;
}) {
  const [template, setTemplate] = useState(initial),
    [form, setForm, current] = useCurrentState<Draft>(draftOf(initial)),
    [baseline, setBaseline] = useState<Draft>(draftOf(initial)),
    [proposal, setProposal] = useState(""),
    [valuesOn, setValuesOn] = useState(false),
    [width, setWidth] = useState<"desktop" | "phone">("desktop"),
    [dark, setDark] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewError, setPreviewError] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [reset, setReset] = useState(false),
    [tab, setTab] = useState("Fields"),
    [open, setOpen] = useState(true),
    [device, setDevice] = useState<"docked" | "drawer" | "sheet">("docked"),
    [editor, setEditor] = useState<Editor | null>(null),
    [more, setMore] = useState<HTMLElement | null>(null),
    [undoReset, setUndoReset] = useState<Draft | null>(null);
  const scope = useBlockToolbar(),
    selection = useBlockSelection(),
    bodyFrame = useRef<HTMLElement | null>(null),
    requestNo = useRef(0),
    testId = useRef(crypto.randomUUID());
  const editable =
      editableEmail(template) &&
      (!template.key.startsWith("team_") || data.user.staff_role === "owner"),
    tabs = editable
      ? ["Fields", "Details", "Plain text"]
      : ["Details", "Plain text"],
    activeTab = tabs.includes(tab) ? tab : tabs[0],
    dirty = !equal(form, baseline),
    allowed = emailPickerFields(template.key),
    values =
      preview?.values ??
      Object.fromEntries(Object.keys(emailFields).map((k) => [k, ""])),
    pickerMap = Object.fromEntries(
      Object.keys(allowed).map((k) => [k, values[k] ?? ""]),
    );
  const history = useSessionHistory<Draft>(
    `email:${template.key}`,
    setForm,
    () => current.current,
  );
  const edit = (patch: Partial<Draft>) => {
    const next = { ...current.current, ...patch };
    if (!editable || equal(next, current.current)) return;
    history.record(current.current, next);
    setForm(next);
  };
  let validation = "";
  try {
    validateTemplate(form);
  } catch (e) {
    validation = (e as Error).message;
  }
  useEffect(() => {
    const media = matchMedia("(min-width:1100px)"),
      phone = matchMedia("(max-width:699px)");
    const sync = () => {
      setDevice(phone.matches ? "sheet" : media.matches ? "docked" : "drawer");
      setOpen(media.matches);
      if (phone.matches) setWidth("phone");
    };
    sync();
    setDark(document.documentElement.dataset.theme === "dark");
    media.addEventListener("change", sync);
    phone.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      phone.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.code === "Backslash") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => {
        setNotice("");
        setUndoReset(null);
      },
      undoReset ? 8000 : 5000,
    );
    return () => clearTimeout(timer);
  }, [notice, undoReset]);
  const payload = () => ({
    proposal_id: proposal || null,
    ...(editable ? current.current : {}),
  });
  useEffect(() => {
    const n = ++requestNo.current,
      controller = new AbortController();
    const timer = setTimeout(() => {
      if (validation) return;
      void api<Preview>(`/api/email-templates/${template.key}/preview`, {
        method: "POST",
        body: JSON.stringify(payload()),
        signal: controller.signal,
      })
        .then((value) => {
          if (requestNo.current === n && !controller.signal.aborted) {
            setPreview(value);
            setPreviewError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted && requestNo.current === n)
            setPreviewError(e.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form, proposal, validation, template.key]);
  async function persist(draft: Draft) {
    setBusy(true);
    setError("");
    try {
      const next = await api<EmailTemplate>(
        `/api/email-templates/${template.key}`,
        { method: "PUT", body: JSON.stringify(draft) },
      );
      setTemplate(next);
      setBaseline(draftOf(next));
      saved(next);
      if (equal(current.current, draft)) setForm(draftOf(next));
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!editable || !dirty) return true;
    if (validation || busy) return false;
    const ok = await persist(current.current);
    if (ok)
      setNotice("Email template saved. Future emails will use this version.");
    return ok;
  }
  async function sendTest() {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ sent_to: string }>(
        `/api/email-templates/${template.key}/test`,
        { ...payload(), request_id: testId.current },
      );
      setNotice(
        `${data.connections?.mock ? "Test captured for" : "Test sent to"} ${result.sent_to}.`,
      );
      testId.current = crypto.randomUUID();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const showTab = (value: string) => {
    setTab(value);
    setOpen(true);
  };
  const sender =
      preview?.context?.sender_name ||
      values["sender.name"] ||
      data.user.staff_name ||
      "Staff",
    workspace =
      preview?.context?.workspace_name ||
      values["workspace.name"] ||
      data.settings?.company_name ||
      "Workspace",
    selected = data.proposals.find((p) => p.id === proposal),
    editedBy =
      data.staff.find(
        (m) =>
          template.updated_by === `staff:${m.user_id}` ||
          template.updated_by === m.user_id,
      )?.display_name ??
      (template.updated_by === data.user.actor
        ? data.user.staff_name
        : "Staff"),
    status = !editable
      ? template.key.startsWith("team_")
        ? "Super admin only · read-only"
        : "Staff notification · read-only"
      : emailIsDefault({ ...template, ...baseline })
        ? "Workspace default"
        : `Edited ${template.updated_at ? studioDate(template.updated_at) : ""} by ${editedBy}`;
  const resetAction =
    editable && !emailIsDefault({ ...template, ...form }) ? (
      <Button variant="ghost" disabled={busy} onClick={() => setReset(true)}>
        Reset to default
      </Button>
    ) : null;
  const testAction = (
    <Button disabled={!!validation || busy} onClick={sendTest}>
      Send me a test
    </Button>
  );
  const readOnlyNote = !editable && (
    <p className="email-readonly-note">
      {template.key.startsWith("team_")
        ? "Only a super admin can edit Team emails."
        : "This message is generated by proposal activity. Its wording and action cannot be edited. Declined notifications include the client’s note when provided."}
    </p>
  );
  const details = (
    <div className="email-details">
      {readOnlyNote}
      <dl>
        <dt>Sent when</dt>
        <dd>{emailWhen[template.key]}</dd>
        <dt>To</dt>
        <dd>
          {template.key.startsWith("team_")
            ? `The team member (${values["team.email"] || "sample recipient"})`
            : template.staff
              ? "The relevant staff members for this proposal"
              : [
                  preview?.context?.client_name ||
                    (selected &&
                      `${selected.client.first_name} ${selected.client.last_name}`) ||
                    values["client.full_name"] ||
                    "Sample client",
                  preview?.context?.client_email || selected?.client.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
        </dd>
        <dt>From</dt>
        <dd>
          {sender} · {workspace}
        </dd>
        <dt>Button opens</dt>
        <dd>
          {template.key.startsWith("team_")
            ? "The set-password page. Managed for you."
            : template.staff
              ? "The proposal record. Managed for you."
              : "The client’s secure proposal link. Managed for you."}
        </dd>
        <dt>Attachments</dt>
        <dd>{emailAttachments(template.key)}</dd>
        <dt>Test emails</dt>
        <dd>
          Go only to you: {data.user.staff_email}. No client is contacted.
        </dd>
      </dl>
    </div>
  );
  const panel =
    activeTab === "Fields" && editable ? (
      <>
        <p className="email-fields-hint">
          Click in the subject or body, then click a field to insert it. Pricing
          fields are optional and aren’t in the defaults.
        </p>
        <FieldOptions
          labels={allowed}
          map={pickerMap}
          onInsert={(path) => {
            if (device !== "docked") {
              setOpen(false);
              requestAnimationFrame(() => scope?.insert(path));
            } else scope?.insert(path);
          }}
        />
      </>
    ) : activeTab === "Plain text" ? (
      <>
        <p className="muted">
          Generated from the same content as the HTML email. This is exactly the
          plain-text alternative sent.
        </p>
        <pre className="email-plain-text" aria-label="Plain-text alternative">
          {preview?.text ?? "Preparing plain text…"}
        </pre>
      </>
    ) : (
      details
    );
  return (
    <div
      className="studio-email-editor studio-v3-editor"
      style={{
        gridTemplateColumns:
          device === "sheet"
            ? "minmax(0,1fr)"
            : `minmax(0,1fr) ${device === "docked" && open ? 400 : 64}px`,
      }}
    >
      <EditorControlConfig
        compact={false}
        map={pickerMap}
        onField={() => showTab("Fields")}
        locked={!editable}
      />
      <EditorHeader
        className="template-editor-header email-editor-header"
        title={template.name}
        titleEditor={<h1 className="email-editor-name">{template.name}</h1>}
        backLabel="Emails"
        backHref="/studio/emails"
        save={save}
        dirty={dirty}
        dirtyLabel="Edited · not saved"
        saving={busy}
        error={error}
        offline={false}
        lastSaved={template.updated_at}
        retry={() => void save()}
        savedLabel={status}
      >
        {device !== "sheet" && (
          <>
            {resetAction}
            {testAction}
          </>
        )}
        {device === "sheet" && (
          <button
            type="button"
            className="studio-editor-more"
            aria-label="More email tools"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            ⋯
          </button>
        )}
        {editable && (
          <Button
            variant="primary"
            disabled={!!validation || busy}
            onClick={save}
          >
            Save
          </Button>
        )}
      </EditorHeader>
      <div className="email-canvas-column">
        <div className="email-canvas-toolbar" data-editor-chrome>
          <div className="segmented" role="group" aria-label="Field display">
            <Button aria-pressed={!valuesOn} onClick={() => setValuesOn(false)}>
              Show fields
            </Button>
            <Button aria-pressed={valuesOn} onClick={() => setValuesOn(true)}>
              Show values
            </Button>
          </div>
          {valuesOn && (
            <label className="field email-sample">
              <span className="sr-only">Preview data</span>
              <select
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              >
                <option value="">Sample client · no prices</option>
                {[...data.proposals]
                  .filter((p) => p.source === "native")
                  .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
                  .slice(0, 20)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.client.company}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="email-width-tools">
            <div className="segmented" role="group" aria-label="Preview width">
              <Button
                aria-pressed={width === "desktop"}
                onClick={() => setWidth("desktop")}
              >
                Desktop
              </Button>
              <Button
                aria-pressed={width === "phone"}
                onClick={() => setWidth("phone")}
              >
                Phone
              </Button>
            </div>
            <Button aria-pressed={dark} onClick={() => setDark(!dark)}>
              Dark
            </Button>
          </div>
        </div>
        <section
          className="studio-template-main email-editor-main"
          aria-label="Email canvas"
        >
          {(validation || error) && (
            <Banner tone="danger" title="Check this email">
              {validation || error}
            </Banner>
          )}
          {(previewError || preview?.logo_error) && (
            <Banner tone="warning" title="Preview needs attention">
              {previewError || preview?.logo_error}
            </Banner>
          )}
          <div
            className="email-preview-frame"
            data-width={width}
            data-values={valuesOn}
          >
            <p className="email-from-line">
              From <strong>{sender}</strong> · {workspace}
            </p>
            <div
              className="email-subject block-frame"
              data-block-id="email-subject"
              data-history-block="email-subject"
              onFocusCapture={() =>
                editable && selection.select("email-subject")
              }
            >
              <FieldEditor
                label="Subject"
                plainText
                readOnly={!editable}
                value={plainBody(form.subject)}
                map={values}
                pickerMap={pickerMap}
                fieldLabels={emailFields}
                showNames={!valuesOn}
                maxLength={300}
                onChange={(body) =>
                  edit({
                    subject: blockText({
                      type: "paragraph",
                      content: body,
                    }).replace(/\s*[\r\n]+\s*/g, " "),
                  })
                }
              />
            </div>
            {preview ? (
              <EmailCanvas
                html={preview.html}
                renderKey={`${template.key}:${proposal}:${JSON.stringify(preview.values)}`}
                body={form.body}
                values={values}
                dark={dark}
                bodyFrame={bodyFrame}
                bodyEditor={
                  <div
                    onFocusCapture={() =>
                      editable && selection.select("email-body")
                    }
                  >
                    <FieldEditor
                      label="Email body"
                      readOnly={!editable}
                      allowLinks
                      value={form.body}
                      onChange={(body) => edit({ body })}
                      map={values}
                      pickerMap={pickerMap}
                      fieldLabels={emailFields}
                      showNames={!valuesOn}
                      formattingMode="email"
                      onEditor={setEditor}
                    />
                  </div>
                }
                buttonEditor={
                  <input
                    aria-label="Primary button label"
                    value={form.button_label}
                    maxLength={80}
                    readOnly={!editable}
                    onChange={(e) => edit({ button_label: e.target.value })}
                  />
                }
                caption={emailButtonCaption(template.key, template.staff)}
              />
            ) : (
              <Skeleton kind="document" label="Preparing email preview…" />
            )}
          </div>
        </section>
      </div>
      <ToolsPanel
        tab={activeTab}
        tabs={tabs}
        label="Email tools"
        phoneDock={false}
        mode={device}
        open={open}
        totals=""
        onToggle={() => setOpen((v) => !v)}
        onTab={showTab}
        actions={
          device === "sheet" ? (
            <div className="email-phone-actions">
              {resetAction}
              {testAction}
            </div>
          ) : undefined
        }
      >
        {panel}
      </ToolsPanel>
      {editable && selection.selected === "email-body" && editor && (
        <EditBar variant="email" frame={bodyFrame}>
          <span className="edit-format-target" ref={scope?.setTarget} />
          <button
            type="button"
            aria-label="More formatting"
            title="More formatting"
            aria-haspopup="dialog"
            aria-expanded={!!more}
            onClick={(e) => setMore(more ? null : e.currentTarget)}
          >
            ⋯
          </button>
        </EditBar>
      )}
      {more && (
        <ToolbarPopover
          trigger={more}
          className="edit-dark-menu block-popover email-format-more"
          close={() => setMore(null)}
        >
          <FormattingControls mode="extras" editor={editor} />
        </ToolbarPopover>
      )}
      {notice && (
        <ToastSurface>
          {notice}
          {undoReset && (
            <>
              {" "}
              ·{" "}
              <button
                type="button"
                onClick={async () => {
                  const previous = undoReset;
                  setUndoReset(null);
                  const before = current.current;
                  if (await persist(previous)) {
                    history.record(before, previous);
                    setForm(previous);
                    setNotice("Reset undone.");
                  }
                }}
              >
                Undo
              </button>
            </>
          )}
        </ToastSurface>
      )}
      {reset && (
        <Sheet title="Reset email template?" onClose={() => setReset(false)}>
          <p>
            Reset “{template.name}” to the default? This replaces its saved
            subject, body and button label. Emails already sent keep their saved
            copy.
          </p>
          <DialogActions>
            <Button onClick={() => setReset(false)}>Keep my edits</Button>
            <Button
              variant="danger"
              busy={busy}
              onClick={async () => {
                const before = structuredClone(current.current);
                setBusy(true);
                setError("");
                try {
                  const next = await post<EmailTemplate>(
                    `/api/email-templates/${template.key}/reset`,
                    {},
                  );
                  setTemplate(next);
                  setForm(draftOf(next));
                  setBaseline(draftOf(next));
                  saved(next);
                  history.record(before, draftOf(next));
                  setUndoReset(before);
                  setNotice("Email template reset to default.");
                  setReset(false);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Reset email template
            </Button>
          </DialogActions>
        </Sheet>
      )}
    </div>
  );
}
