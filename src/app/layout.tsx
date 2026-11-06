import { coverBrandCss } from "../lib/cover-render";
import "./globals.css";
import "./foundation.css";
import "./client-flow.css";
import "./client-sheets.css";
import "./records.css";
import "./studio.css";
import "./review-polish.css";
import "./block-controls.css";
import "./emails.css";
import "./editor.css";
import "./studio-v3.css";
import "./editor-fields.css";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{coverBrandCss}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
