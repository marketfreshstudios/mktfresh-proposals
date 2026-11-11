"use client";
import { useEffect, useRef, useState } from "react";
import { blockText } from "../lib/editor-document";
import { resolve } from "../lib/presentation";
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
  children,
}: {
  thread: PublicQuestion | QuestionThread;
  timezone: string;
  notify?: boolean;
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
      <header className="question-thread-heading">
        <div>
          <strong>
            {"contact" in thread ? thread.contact.name : thread.name}
          </strong>
          <time dateTime={thread.created_at}>{time(thread.created_at)}</time>
        </div>
        <span className={`question-badge ${thread.status}`}>
          {questionStatus[thread.status]}
        </span>
      </header>
      {notify && <p className="question-note">New client question</p>}
      {thread.section && (
        <p className="question-section">About {thread.section.label}</p>
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
}: {
  proposal: PublicProposal;
  token: string;
  password: string;
  requested: string | null;
  close: () => void;
}) {
  const url = `/api/public/${token}/questions`;
  const headers = { "x-proposal-password": password };
  const [result, setResult] = useState<ClientQuestionsResult | null>(null);
  const [loadError, setLoadError] = useState("");
  const [posted, setPosted] = useState("");
  const history = useRef<HTMLElement>(null);
  useEffect(() => {
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
  }, [url, password, proposal.status, requested]);
  useQuestionAnchor(!!result);
  return (
    <>
      {result?.threads.length || posted ? (
        <section
          className="card questions-panel"
          ref={history}
          aria-label="Your questions"
          tabIndex={-1}
        >
          <h2>Your questions</h2>
          {posted && (
            <p role="status" className="question-note">
              Question sent. We’ll email you when there’s a reply.
            </p>
          )}
          {!result?.can_ask && (
            <p className="muted">This conversation is read-only.</p>
          )}
          {result?.threads.map((thread) => (
            <QuestionCard
              key={thread.id}
              thread={thread}
              timezone={proposal.timezone}
            />
          ))}
        </section>
      ) : null}
      {requested !== null && (
        <Sheet
          title="Ask a question"
          className="client-question-sheet"
          surface="client"
          onClose={close}
        >
          {loadError && <p role="alert">{loadError}</p>}
          {!result ? (
            <p role="status">Loading questions…</p>
          ) : result.can_ask ? (
            <AskForm
              initial={requested}
              sections={proposal.content.flatMap((block, i) =>
                block.type === "heading" && (block.level ?? 1) === 1
                  ? [
                      {
                        key: `section:${block.id ?? i}`,
                        label:
                          resolve(blockText(block), proposal.variables) ||
                          "Untitled section",
                      },
                    ]
                  : [],
              )}
              needsContact={result.needs_contact}
              onClose={close}
              send={async (value) => {
                const thread = await api<PublicQuestion>(url, {
                  method: "POST",
                  headers,
                  body: JSON.stringify(value),
                });
                setResult(
                  (current) =>
                    current && {
                      ...current,
                      needs_contact: false,
                      threads: [
                        thread,
                        ...current.threads.filter((t) => t.id !== thread.id),
                      ],
                    },
                );
                setPosted(thread.id);
                close();
                requestAnimationFrame(() => {
                  history.current?.scrollIntoView({ block: "start" });
                  history.current?.focus({ preventScroll: true });
                });
              }}
            />
          ) : (
            <p>This conversation is read-only.</p>
          )}
        </Sheet>
      )}
    </>
  );
}

function AskForm({
  initial,
  sections,
  needsContact,
  onClose,
  send,
}: {
  initial: string;
  sections: { key: string; label: string }[];
  needsContact: boolean;
  onClose: () => void;
  send: (input: {
    id: string;
    text: string;
    section?: string;
    contact?: { name: string; email: string };
  }) => Promise<void>;
}) {
  const [section, setSection] = useState(initial);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useRef(crypto.randomUUID());
  return (
    <form
      className="stack question-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !text.trim()) return;
        setBusy(true);
        setError("");
        try {
          await send({
            id: id.current,
            text,
            ...(section ? { section } : {}),
            ...(needsContact ? { contact: { name, email } } : {}),
          });
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <p className="muted">
        The sender will see your question here. We’ll email you when they reply.
      </p>
      {sections.length > 0 && (
        <label className="field">
          Section
          <Select value={section} onChange={(e) => setSection(e.target.value)}>
            <option value="">General question</option>
            {sections.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </label>
      )}
      {needsContact && (
        <>
          <label className="field">
            Your name
            <input
              required
              autoComplete="name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
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
              onChange={(e) => setEmail(e.target.value)}
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
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <small className="muted">
        {text.length.toLocaleString("en-US")} / 2,000 characters
      </small>
      {error && <p role="alert">{error}</p>}
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
          Send question
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
  return { data, error, replying, setReplying, busy, load, update };
}

export function ProposalQuestions({
  questions,
  timezone,
}: {
  questions: ReturnType<typeof useProposalQuestions>;
  timezone: string;
}) {
  const { data, error, replying, setReplying, busy, load, update } = questions;
  const openCount =
    data?.threads.filter((thread) => thread.status === "open").length ?? 0;
  if (!data?.threads.length && !error) return null;
  return (
    <section className="record-section" aria-label="Questions">
      <StaffSectionHeading
        action={<Button onClick={load}>Refresh questions</Button>}
      >
        Client questions{" "}
        {openCount > 0 && (
          <span className="pill warning">{openCount} open</span>
        )}
      </StaffSectionHeading>
      <div className="card questions-panel">
        {error && <p role="alert">{error}</p>}
        {data?.threads.map((thread) => (
          <QuestionCard
            key={thread.id}
            thread={thread}
            timezone={timezone}
            notify={data.notified.includes(thread.id)}
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
