import { coverLayoutCss, sidePhotoCoverCss } from "../lib/cover-graphics";
import { coverBrandCss } from "../lib/cover-render";
import { PointerFocus } from "../components/pointer-focus";
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
import "./covers.css";
import "./color-picker.css";
import "./starter-library.css";
import "./deployment-notice.css";
import "./form-controls.css";
import "./ink-clay-tokens.css";
import "./ink-clay.css";
import "./reports.css";
import "./ink-clay-records.css";
import "./ink-clay-editor-studio.css";
import "./column-styles.css";
import "./ink-clay-client-account.css";
import "./staff-tables.css";
import "./staff-account.css";
import "./staff-headings.css";
import "./toast.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <style>{coverBrandCss + coverLayoutCss + sidePhotoCoverCss}</style>
      </head>
      <body>
        <PointerFocus />
        {children}
      </body>
    </html>
  );
}
