import "./globals.css";
import "./foundation.css";
import "./client-flow.css";
import "./records.css";
import "./studio.css";
import "./review-polish.css";
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
