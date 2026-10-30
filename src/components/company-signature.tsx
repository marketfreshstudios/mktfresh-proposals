"use client";
import { useRef, useState } from "react";
import { Banner, Button, Field } from "./ui";
export function StoredSignatureEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (image: string | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
  const [ink, setInk] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="stack">
      {value && (
        <img
          alt="Stored company signature"
          src={value}
          style={{
            maxWidth: "100%",
            maxHeight: 140,
            objectFit: "contain",
            background: "white",
          }}
        />
      )}
      <Field label="Upload signature (PNG, under 350 KB)">
        <input
          type="file"
          accept="image/png"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 350000 || file.type !== "image/png") {
              setError("Choose a PNG under 350 KB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              onChange(String(reader.result));
              setError("");
            };
            reader.readAsDataURL(file);
          }}
        />
      </Field>
      <p>Or draw the designated signatory’s signature once:</p>
      <canvas
        ref={canvas}
        width={720}
        height={220}
        aria-label="Draw stored company signature"
        style={{
          width: "100%",
          background: "white",
          border: "1px solid #8b9299",
          touchAction: "none",
        }}
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const c = canvas.current!,
            r = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          ctx.strokeStyle = "#12151a";
          ctx.lineWidth = 2.5;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(
            ((e.clientX - r.left) * c.width) / r.width,
            ((e.clientY - r.top) * c.height) / r.height,
          );
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = canvas.current!,
            r = c.getBoundingClientRect(),
            ctx = c.getContext("2d")!;
          ctx.lineTo(
            ((e.clientX - r.left) * c.width) / r.width,
            ((e.clientY - r.top) * c.height) / r.height,
          );
          ctx.stroke();
          setInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <div className="row">
        <Button
          type="button"
          disabled={!ink}
          onClick={() => onChange(canvas.current!.toDataURL("image/png"))}
        >
          Use drawn signature
        </Button>
        <Button
          type="button"
          onClick={() => {
            canvas.current?.getContext("2d")?.clearRect(0, 0, 720, 220);
            setInk(false);
          }}
        >
          Clear drawing
        </Button>
        <Button type="button" onClick={() => onChange(null)}>
          Remove stored signature
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
