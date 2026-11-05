"use client";
import { useEffect, useRef, useState } from "react";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  PDFDocumentLoadingTask,
} from "pdfjs-dist";
import type { PdfPreview } from "../lib/pdf-preview";
import { Button } from "./ui";
import { DialogActions } from "./dialog-actions";
function PdfCanvas({ page, scale }: { page: PDFPageProxy; scale: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!,
      viewport = page.getViewport({ scale: (scale * 96) / 72 }),
      ratio = devicePixelRatio || 1;
    el.width = Math.ceil(viewport.width * ratio);
    el.height = Math.ceil(viewport.height * ratio);
    el.style.width = `${viewport.width}px`;
    el.style.height = `${viewport.height}px`;
    const task = page.render({
      canvas: el,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    task.promise.catch((e) => {
      if (e.name !== "RenderingCancelledException")
        console.error("PDF page could not render");
    });
    return () => task.cancel();
  }, [page, scale]);
  return (
    <canvas
      ref={canvas}
      role="img"
      aria-label={`PDF page ${page.pageNumber}`}
    />
  );
}
export function PdfPreviewViewer({
  load,
  close,
}: {
  load: () => Promise<PdfPreview>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [pages, setPages] = useState<PDFPageProxy[]>([]),
    [scale, setScale] = useState(1),
    [error, setError] = useState(""),
    [url, setUrl] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let stopped = false,
      document: PDFDocumentProxy | undefined,
      loading: PDFDocumentLoadingTask | undefined,
      objectUrl = "";
    (async () => {
      const result = await load();
      if (stopped) return;
      const bytes = Uint8Array.from(atob(result.pdf_base64), (c) =>
        c.charCodeAt(0),
      );
      objectUrl = URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" }),
      );
      setUrl(objectUrl);
      const pdf = await import("pdfjs-dist");
      pdf.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      loading = pdf.getDocument({ data: bytes, useSystemFonts: false });
      document = await loading.promise;
      if (stopped) {
        await loading.destroy();
        return;
      }
      const list = await Promise.all(
        Array.from({ length: document.numPages }, (_, n) =>
          document!.getPage(n + 1),
        ),
      );
      if (!stopped) setPages(list);
    })().catch((e) => {
      if (!stopped) setError(e.message);
    });
    return () => {
      stopped = true;
      loading?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="pdf-viewer"
      aria-label="Preview PDF"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <strong>Preview — not signed</strong>
        <DialogActions className="pdf-viewer-actions">
          <Button
            aria-label="Zoom out"
            disabled={scale <= 0.25}
            onClick={() => setScale((s) => Math.max(0.25, s - 0.25))}
          >
            −
          </Button>
          <output aria-label="PDF zoom">{Math.round(scale * 100)}%</output>
          <Button
            aria-label="Zoom in"
            disabled={scale >= 2}
            onClick={() => setScale((s) => Math.min(2, s + 0.25))}
          >
            +
          </Button>
          {url && (
            <a className="btn" href={url} download="proposal-preview.pdf">
              Download preview
            </a>
          )}
          {url && (
            <a className="btn" href={url} target="_blank" rel="noopener">
              Open in new tab
            </a>
          )}
          <Button onClick={close}>Close PDF preview</Button>
        </DialogActions>
      </header>
      {error ? (
        <p role="alert">{error}</p>
      ) : !pages.length ? (
        <p role="status">Rendering PDF preview…</p>
      ) : (
        <div className="pdf-viewer-layout">
          <nav aria-label="Page thumbnails">
            {pages.map((p) => (
              <button
                key={p.pageNumber}
                aria-label={`Go to page ${p.pageNumber}`}
                onClick={() =>
                  dialog.current
                    ?.querySelector(`#preview-page-${p.pageNumber}`)
                    ?.scrollIntoView({ block: "start" })
                }
              >
                <PdfCanvas page={p} scale={0.18} />
                <span>Page {p.pageNumber}</span>
              </button>
            ))}
          </nav>
          <main>
            {pages.map((p) => (
              <section id={`preview-page-${p.pageNumber}`} key={p.pageNumber}>
                <PdfCanvas page={p} scale={scale} />
              </section>
            ))}
          </main>
        </div>
      )}
    </dialog>
  );
}
