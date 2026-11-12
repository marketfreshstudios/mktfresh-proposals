"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircleReply, X } from "lucide-react";
import type { z } from "zod";
import type { AskQuestionSchema } from "../lib/proposal-questions";
import {
  questionExcerpt,
  type questionTargets,
  type QuestionTarget,
} from "../lib/question-targets";
import { ToolbarPopover } from "./toolbar-popover";
import { ToastSurface } from "./toast-surface";
import {
  goToQuestionTarget,
  isPhoneReading,
  type QuestionRequest,
} from "./client-question-controls";
import {
  questionLimit,
  type ClientQuestionsResult,
  type PublicQuestion,
  type QuestionThread,
  type StaffQuestionsResult,
} from "../lib/proposal-questions";
import type { PublicProposal } from "./client-proposal";
import { DialogActions } from "./dialog-actions";
import { Select } from "./form-controls";
import { Sheet } from "./foundation";
import { StaffSectionHeading } from "./staff-section-heading";
import { api, Button, post } from "./ui";

const questionStatus = {
  open: "Open",
  answered: "Answered",
  resolved: "Resolved",
};

function QuestionCard({
  thread,
  timezone,
  notify,
  record = false,
  children,
}: {
  thread: PublicQuestion | QuestionThread;
  timezone: string;
  notify?: boolean;
  record?: boolean;
  children?: React.ReactNode;
}) {
  const time = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(new Date(value));
  return (
    <article
      id={`question-${thread.id}`}
      className="question-thread"
      tabIndex={-1}
    >
      {record ? (
        <header className="record-question-meta">
          <span>{"contact" in thread ? thread.contact.name : thread.name}</span>
          {thread.section && <span> | {thread.section.label}</span>}
          {" | "}
          <time dateTime={thread.created_at}>{time(thread.created_at)}</time>
          {thread.status !== "open" ? (
            <span className={`question-badge ${thread.status}`}>
              {questionStatus[thread.status]}
            </span>
          ) : (
            <span className="sr-only"> | Open</span>
          )}
        </header>
      ) : (
        <>
          <header className="question-thread-heading">
            <div>
              <strong>
                {"contact" in thread ? thread.contact.name : thread.name}
              </strong>
              <time dateTime={thread.created_at}>
                {time(thread.created_at)}
              </time>
            </div>
            <span className={`question-badge ${thread.status}`}>
              {questionStatus[thread.status]}
            </span>
          </header>
          {thread.section && (
            <p className="question-section">About {thread.section.label}</p>
          )}
        </>
      )}
      {notify && <p className="question-note">New client question</p>}
      {thread.excerpt && (
        <blockquote className="question-excerpt">{thread.excerpt}</blockquote>
      )}
      <p className="question-text">{thread.question}</p>
      {thread.replies.map((reply) => (
        <div className="question-reply" key={reply.id}>
          <strong>{reply.name}</strong>
          <time dateTime={reply.created_at}>{time(reply.created_at)}</time>
          <p className="question-text">{reply.text}</p>
        </div>
      ))}
      {children}
    </article>
  );
}

function useQuestionAnchor(loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;
    const hash = location.hash.slice(1);
    if (!/^question-[\da-f-]{36}$/i.test(hash)) return;
    const target = document.getElementById(hash);
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  }, [loaded]);
}

export function ClientQuestions({
  proposal,
  token,
  password,
  requested,
  close,
  inReadingRail,
  preview,
  historyOpen,
  setHistoryOpen,
  onThreadsChange,
  onAsk,
  targets,
}: {
  proposal: PublicProposal;
  token: string;
  password: string;
  requested: QuestionRequest | null;
  close: () => void;
  inReadingRail?: boolean;
  preview?: boolean;
  historyOpen: boolean;
  setHistoryOpen: (open: boolean) => void;
  onThreadsChange: (threads: PublicQuestion[]) => void;
  onAsk?: (request: QuestionRequest) => void;
  targets: ReturnType<typeof questionTargets>;
}) {
  const url = `/api/public/${token}/questions`;
  const headers = { "x-proposal-password": password };
  const [result, setResult] = useState<ClientQuestionsResult | null>(
    preview ? { threads: [], can_ask: true, needs_contact: false } : null,
  );
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [edit, setEdit] = useState<PublicQuestion | null>(null);
  const [remove, setRemove] = useState<PublicQuestion | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const openedHash = useRef(false);
  const threads = result?.threads ?? emptyClientThreads;
  useEffect(() => {
    if (preview) return;
    let active = true;
    setLoadError("");
    api<ClientQuestionsResult>(url, {
      headers: { "x-proposal-password": password },
    })
      .then((data) => {
        if (active && Array.isArray(data.threads)) setResult(data);
      })
      .catch((e) => {
        if (active) setLoadError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url, password, proposal.status, preview, historyOpen]);
  useEffect(() => onThreadsChange(threads), [onThreadsChange, threads]);
  useEffect(() => {
    if (!result || openedHash.current) return;
    openedHash.current = true;
    const hash = location.hash.slice(1);
    const linked = threads.find((thread) => hash === `question-${thread.id}`);
    if (!linked) return;
    setReply(linked.id);
    if (inReadingRail && isPhoneReading()) setHistoryOpen(true);
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const node = document.getElementById(hash);
        node?.scrollIntoView({ block: "start" });
        node?.focus({ preventScroll: true });
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [!!result]);

  const replace = (thread: PublicQuestion) =>
    setResult(
      (current) =>
        current && {
          ...current,
          needs_contact: false,
          threads: current.threads.some((old) => old.id === thread.id)
            ? current.threads.map((old) =>
                old.id === thread.id ? thread : old,
              )
            : [thread, ...current.threads],
        },
    );
  const mark = (message: string) => setToast(message);
  const showTarget = (thread: PublicQuestion) => {
    setHistoryOpen(false);
    requestAnimationFrame(() =>
      goToQuestionTarget(
        thread.block_id ?? thread.section?.key.replace(/^section:/, "") ?? "",
      ),
    );
  };
  const writable = !!result?.can_ask && !preview;
  const time = (value: string, date = false) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: proposal.timezone,
      ...(date ? { dateStyle: "medium" as const } : {}),
      timeStyle: "short",
    }).format(new Date(value));
  const askAnother = (event: React.MouseEvent<HTMLButtonElement>) => {
    setHistoryOpen(false);
    onAsk?.({ target: generalQuestion, trigger: event.currentTarget });
  };
  const list = (
    <>
      {historyOpen && (
        <p className="muted">
          Questions you’ve asked about this proposal, and{" "}
          {proposal.contact.name
            ? `${proposal.contact.name.split(" ")[0]}’s replies`
            : "the sender’s replies"}
          .
        </p>
      )}
      {historyOpen && onAsk && (
        <button className="question-text-action" onClick={askAnother}>
          Ask another question
        </button>
      )}
      {!threads.length && (
        <p className="muted">
          {preview
            ? "No questions are recorded in preview."
            : loadError
              ? "Questions couldn’t be loaded."
              : result
                ? "No questions yet."
                : "Loading questions…"}
        </p>
      )}
      {result && !result.can_ask && threads.length > 0 && (
        <p className="muted">This conversation is read-only.</p>
      )}
      {threads.map((thread) => {
        const hasReply = thread.replies.length > 0;
        const canLocate = !!thread.block_id || !!thread.section?.key;
        return (
          <article
            className="client-question-thread"
            id={`question-${thread.id}`}
            tabIndex={-1}
            key={thread.id}
          >
            <div className="client-question-context">
              <strong>{thread.section?.label ?? "General question"}</strong>
              {historyOpen && thread.excerpt && (
                <p className="question-excerpt">{thread.excerpt}</p>
              )}
              {historyOpen && canLocate && (
                <button
                  className="question-text-action"
                  onClick={() => showTarget(thread)}
                >
                  Go to this part
                </button>
              )}
            </div>
            {historyOpen && (
              <div className="client-question-message-meta">
                <strong>You</strong>
                <time dateTime={thread.created_at}>
                  {time(thread.created_at, true)}
                </time>
              </div>
            )}
            <p className="question-text">{thread.question}</p>
            <div className="client-question-actions">
              {hasReply ? (
                <span className="client-question-answered">
                  <MessageCircleReply size={14} aria-hidden="true" />
                  Answered by {thread.replies[0].name}
                </span>
              ) : (
                <span>
                  {thread.status === "resolved"
                    ? "Resolved"
                    : "Waiting for a reply"}
                </span>
              )}
              <div>
                {hasReply ? (
                  <button
                    className="question-text-action"
                    onClick={() =>
                      setReply(reply === thread.id ? null : thread.id)
                    }
                    aria-expanded={reply === thread.id}
                  >
                    {reply === thread.id ? "Hide reply" : "View reply"}
                  </button>
                ) : (
                  <>
                    {writable && (
                      <button
                        className="question-text-action"
                        onClick={() => setEdit(thread)}
                      >
                        Edit
                      </button>
                    )}
                    {writable && historyOpen && (
                      <button
                        className="question-text-action"
                        onClick={() => {
                          setRemoveError("");
                          setRemove(thread);
                        }}
                      >
                        Delete
                      </button>
                    )}
                    {!historyOpen && canLocate && (
                      <button
                        className="question-text-action"
                        onClick={() => showTarget(thread)}
                      >
                        Go to
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {hasReply &&
              (historyOpen || reply === thread.id) &&
              thread.replies.map((answer) => (
                <div className="question-reply" key={answer.id}>
                  <strong>{answer.name}</strong>
                  <time dateTime={answer.created_at}>
                    {time(answer.created_at, true)}
                  </time>
                  <p className="question-text">{answer.text}</p>
                </div>
              ))}
          </article>
        );
      })}
    </>
  );
  const askForm = requested && (
    <>
      {loadError && <p role="alert">{loadError}</p>}
      {!result ? (
        <p role="status">Loading questions…</p>
      ) : result.can_ask ? (
        <AskForm
          initial={requested.target}
          sections={targets.sections}
          needsContact={result.needs_contact}
          sender={proposal.contact.name}
          preview={preview}
          onClose={close}
          send={async (value) => {
            if (preview || !result.can_ask) return;
            const thread = await api<PublicQuestion>(url, {
              method: "POST",
              headers,
              body: JSON.stringify(value),
            });
            replace(thread);
            close();
            mark("Question sent. We’ll email you when there’s a reply.");
          }}
        />
      ) : (
        <p>This conversation is read-only.</p>
      )}
    </>
  );
  return (
    <>
      {!historyOpen && (inReadingRail || threads.length > 0) && (
        <section
          className="card questions-panel"
          id={inReadingRail ? "your-questions" : undefined}
          aria-label="Your questions"
          tabIndex={-1}
        >
          <header className="client-question-list-heading">
            <h2>Your questions</h2>
            <span>{threads.length}</span>
          </header>
          {list}
        </section>
      )}
      {historyOpen && (
        <Sheet
          title="Your questions"
          className="client-question-history"
          surface="client"
          onClose={() => setHistoryOpen(false)}
        >
          {list}
        </Sheet>
      )}
      {requested &&
        (requested.anchor?.isConnected && !isPhoneReading() ? (
          <ToolbarPopover
            className="client-ask-popover"
            placementAnchor={requested.anchor}
            dock={document.querySelector<HTMLElement>(".flow-reading-rail")}
            trigger={requested.trigger}
            close={close}
          >
            <section
              role="dialog"
              aria-label="Ask a question"
              className="client-ask-popover-body"
            >
              <div className="client-ask-heading">
                <h2 tabIndex={-1} autoFocus>
                  Ask a question
                </h2>
                <button
                  type="button"
                  aria-label="Close"
                  className="btn ghost"
                  onClick={close}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {askForm}
            </section>
          </ToolbarPopover>
        ) : (
          <Sheet
            title="Ask a question"
            className="client-question-sheet"
            surface="client"
            onClose={close}
          >
            {askForm}
          </Sheet>
        ))}
      {edit && writable && (
        <Sheet
          title="Edit question"
          className="client-question-sheet"
          surface="client"
          onClose={() => setEdit(null)}
        >
          <AskForm
            initial={{
              label: edit.section?.label ?? "General question",
              excerpt: edit.excerpt,
            }}
            sections={targets.sections}
            needsContact={false}
            sender={proposal.contact.name}
            edit={edit.question}
            onClose={() => setEdit(null)}
            send={async ({ text }) => {
              const thread = await api<PublicQuestion>(`${url}/${edit.id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ text }),
              });
              replace(thread);
              setEdit(null);
              mark("Question updated.");
            }}
          />
        </Sheet>
      )}
      {remove && writable && (
        <Sheet
          title="Delete question?"
          className="client-question-sheet"
          surface="client"
          onClose={() => setRemove(null)}
        >
          <p>This removes your question from the proposal.</p>
          {removeError && <p role="alert">{removeError}</p>}
          <DialogActions>
            <Button disabled={removeBusy} onClick={() => setRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={removeBusy}
              onClick={async () => {
                setRemoveBusy(true);
                setRemoveError("");
                try {
                  await api(`${url}/${remove.id}`, {
                    method: "DELETE",
                    headers,
                  });
                  setResult(
                    (current) =>
                      current && {
                        ...current,
                        threads: current.threads.filter(
                          (thread) => thread.id !== remove.id,
                        ),
                      },
                  );
                  setRemove(null);
                  mark("Question deleted.");
                } catch (error) {
                  setRemoveError((error as Error).message);
                } finally {
                  setRemoveBusy(false);
                }
              }}
            >
              Delete question
            </Button>
          </DialogActions>
        </Sheet>
      )}
      {toast && (
        <ToastSurface
          className="client-question-toast"
          onDismiss={() => setToast("")}
        >
          {toast}
        </ToastSurface>
      )}
    </>
  );
}

const emptyClientThreads: PublicQuestion[] = [];
export const generalQuestion: QuestionTarget = { label: "General question" };

function AskForm({
  initial,
  sections,
  needsContact,
  sender,
  preview,
  edit,
  onClose,
  send,
}: {
  initial: QuestionTarget;
  sections: Map<string, string>;
  needsContact: boolean;
  sender: string;
  preview?: boolean;
  edit?: string;
  onClose: () => void;
  send: (input: z.infer<typeof AskQuestionSchema>) => Promise<void>;
}) {
  const [target, setTarget] = useState(initial);
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState(edit ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useRef(crypto.randomUUID());
  return (
    <form
      className="stack question-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (preview || busy || !text.trim()) return;
        setBusy(true);
        setError("");
        try {
          await send({
            id: id.current,
            text,
            ...(target.section ? { section: target.section } : {}),
            ...(target.block_id
              ? { block_id: target.block_id, excerpt: target.excerpt }
              : {}),
            ...(needsContact ? { contact: { name, email } } : {}),
          });
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <div className="client-ask-about">
        <div className="client-about-heading">
          <strong>About this</strong>
          {edit === undefined && (
            <button
              type="button"
              className="question-text-action"
              aria-expanded={changing}
              onClick={() => setChanging(!changing)}
            >
              Change
            </button>
          )}
        </div>
        {changing ? (
          <label className="field">
            Section
            <Select
              value={target.section ?? ""}
              onChange={(event) => {
                const section = event.target.value;
                setTarget(
                  section
                    ? { section, label: sections.get(section) ?? "Section" }
                    : generalQuestion,
                );
                setChanging(false);
              }}
            >
              <option value="">General question</option>
              {[...sections]
                .filter(
                  ([key]) => key !== "section:cover" || initial.section === key,
                )
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </Select>
          </label>
        ) : (
          <>
            <strong>{target.label}</strong>
            {target.excerpt &&
              target.excerpt !== questionExcerpt(target.label) && (
                <p className="question-excerpt">{target.excerpt}</p>
              )}
          </>
        )}
      </div>
      {needsContact && (
        <>
          <label className="field">
            Your name
            <input
              required
              autoComplete="name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Your email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
        </>
      )}
      <label className="field">
        Your question
        <textarea
          required
          rows={4}
          maxLength={questionLimit}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="client-question-helper">
        <span>
          {preview
            ? "Preview: questions aren’t sent from here."
            : `${sender.split(" ")[0] || "The sender"} sees it here. We’ll email you when there’s a reply.`}
        </span>
        <small>{text.length.toLocaleString("en-US")} / 2,000</small>
      </div>
      {error && <p role="alert">{error}</p>}
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={preview || !text.trim()}
        >
          {edit === undefined ? "Send question" : "Save question"}
        </Button>
      </DialogActions>
    </form>
  );
}

export function useProposalQuestions(id: string | null) {
  const url = id ? `/api/proposals/${id}/questions` : null;
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const [snapshot, setSnapshot] = useState<{
    url: string;
    result: StaffQuestionsResult;
  } | null>(null);
  const [error, setError] = useState("");
  const [replying, setReplying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const data = snapshot?.url === url ? snapshot.result : null;
  const load = async () => {
    if (!url) return;
    setError("");
    try {
      const result = await api<StaffQuestionsResult>(url);
      if (currentUrl.current === url && Array.isArray(result.threads))
        setSnapshot({ url, result });
    } catch (e) {
      if (currentUrl.current === url) setError((e as Error).message);
    }
  };
  useEffect(() => {
    setReplying(null);
    setBusy(false);
    void load();
  }, [url]);
  useQuestionAnchor(!!data);
  const update = async (thread: string, action: object) => {
    if (!url) return;
    setError("");
    setBusy(true);
    try {
      const result = await post<StaffQuestionsResult>(
        `${url}/${thread}`,
        action,
      );
      if (currentUrl.current !== url) return;
      setSnapshot({ url, result });
      setReplying(null);
    } catch (e) {
      if (currentUrl.current === url) setError((e as Error).message);
    } finally {
      if (currentUrl.current === url) setBusy(false);
    }
  };
  return { data, error, replying, setReplying, busy, update };
}

export function ProposalQuestions({
  questions,
  timezone,
}: {
  questions: ReturnType<typeof useProposalQuestions>;
  timezone: string;
}) {
  const { data, error, replying, setReplying, busy, update } = questions;
  const openCount =
    data?.threads.filter((thread) => thread.status === "open").length ?? 0;
  if (!data?.threads.length && !error) return null;
  return (
    <section className="record-section" aria-label="Questions">
      <StaffSectionHeading
        action={
          openCount > 0 ? (
            <span className="pill warning">{openCount} open</span>
          ) : undefined
        }
      >
        Client questions
      </StaffSectionHeading>
      <div className="card questions-panel">
        {error && <p role="alert">{error}</p>}
        {data?.threads.map((thread) => (
          <QuestionCard
            key={thread.id}
            thread={thread}
            timezone={timezone}
            notify={data.notified.includes(thread.id)}
            record
          >
            {thread.status !== "resolved" && (
              <div className="question-thread-actions">
                {data.can_reply && (
                  <Button
                    onClick={() => setReplying(thread.id)}
                    disabled={busy}
                  >
                    Reply
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => void update(thread.id, { action: "resolve" })}
                  disabled={busy}
                >
                  Mark resolved
                </Button>
              </div>
            )}
            {replying === thread.id && (
              <ReplyForm
                busy={busy}
                onClose={() => setReplying(null)}
                send={(reply, text) =>
                  update(thread.id, { action: "reply", id: reply, text })
                }
              />
            )}
          </QuestionCard>
        ))}
      </div>
    </section>
  );
}

function ReplyForm({
  busy,
  onClose,
  send,
}: {
  busy: boolean;
  onClose: () => void;
  send: (id: string, text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const id = useRef(crypto.randomUUID());
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      className="stack question-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && text.trim()) void send(id.current, text);
      }}
    >
      <label className="field">
        Your reply
        <textarea
          ref={input}
          rows={4}
          maxLength={questionLimit}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          type="submit"
          busy={busy}
          disabled={!text.trim()}
        >
          Send reply
        </Button>
      </DialogActions>
    </form>
  );
}
