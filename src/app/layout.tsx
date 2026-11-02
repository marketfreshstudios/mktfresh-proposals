import "./globals.css";
import "./foundation.css";
import "./client-flow.css";
import "./records.css";
import "./studio.css";
import "./review-polish.css";
import "./block-controls.css";
import "./emails.css";
import "./editor-ux.css";
import "./editor-followup.css";
import "./editor-polish.css";
import "./editor-round3.css";
import "./editor-round4.css";
import "./editor-round5.css";
import "./editor-round6.css";
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
