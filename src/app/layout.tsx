import {
  coverLayoutCss,
  sidePhotoCoverCss,
  phonePreviewCoverCss,
} from "../lib/cover-graphics";
import { coverBrandCss } from "../lib/cover-render";
import { PointerFocus } from "../components/pointer-focus";
import { TapDebug } from "../components/tap-debug";
import "./globals.css";
import "./foundation.css";
import "./proposal-loading.css";
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
import "./client-reading.css";
import "./client-questions.css";
import "./staff-tables.css";
import "./staff-account.css";
import "./staff-headings.css";
import "./toast.css";

// iPhone and iPad zoom into any field whose text is under 16px when it is
// focused. maximum-scale=1 stops that on iOS, which still allows pinch zoom.
// Android honors maximum-scale for pinch zoom too, so it is added on iOS only.
const IOS_NO_FOCUS_ZOOM = `(function(){var n=navigator,d=document;if(!/iPhone|iPad|iPod/.test(n.userAgent)&&!(n.platform==="MacIntel"&&n.maxTouchPoints>1))return;function f(){d.querySelectorAll('meta[name="viewport"]').forEach(function(m){if(!/maximum-scale/.test(m.content))m.content+=", maximum-scale=1"})}f();new MutationObserver(f).observe(d.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["content"]})})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: IOS_NO_FOCUS_ZOOM }} />
        <style>
          {coverBrandCss +
            coverLayoutCss +
            sidePhotoCoverCss +
            phonePreviewCoverCss}
        </style>
      </head>
      <body>
        <PointerFocus />
        <TapDebug />
        {children}
      </body>
    </html>
  );
}
