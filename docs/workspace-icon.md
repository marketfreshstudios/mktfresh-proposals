# Workspace logo icon

Brand has separate dashed upload fields for the existing wide logo and an optional square PNG icon. Both remain restricted to Super admins. The icon's file name and byte size survive reloads, and Replace/Remove use the existing Workspace autosave path. Invalid uploads keep the previous icon.

The icon appears beside the workspace name in the sidebar and Studio tablet header, and in Studio's phone Account row. Without it, the existing letter avatar remains. Client proposal routes use 16px and 32px favicons plus a 180px Apple touch icon, including password, signing, billing and completed screens. They read the current workspace icon independently of frozen document branding. Staff pages keep Yeswell's icons. A token-free generic return page has no workspace identity and retains its standard fallback.

PNG only: SVG is not safely supported by the current wide-logo upload. Server validation checks the PNG signature, a successful decode, square dimensions of at least 128px, one frame, and a file smaller than 750 KB. Decoding is capped at 4096px per side. Sharp was already installed by Next; the same version is now an explicit pinned dependency for validation and derivative generation.

Files use the existing private bucket and workspace-prefixed content hashes. Settings store an optional JSON object, so **no hosted SQL or storage-policy changes are needed**. Public image reads are token-scoped; staff reads are authenticated. Removing the setting leaves immutable stored files as the existing logo path does. The wide logo remains the only logo used in PDFs, certificates and emails.

## Captures

All captures use neutral local fixtures.

- [Brand: empty uploads, 1440](screenshots/workspace-icon/brand-empty-1440.png)
- [Brand: both uploads, 1440](screenshots/workspace-icon/brand-filled-1440.png)
- [Sidebar icon, 1440](screenshots/workspace-icon/sidebar-icon-1440.png)
- [Tablet header icon, 768](screenshots/workspace-icon/tablet-icon-768.png)
- [Client page, 1440](screenshots/workspace-icon/client-icon-1440.png)
- [Real Chrome tab with the workspace favicon](screenshots/workspace-icon/client-browser-tab.png) — isolated incognito window, cropped to the tab/address bar to omit unrelated bookmarks; the page capture above supplies the document context.

Regenerate the page captures with `WORKSPACE_ICON_CAPTURE=1 npm run test:e2e -- e2e/workspace-icon.spec.ts`. Browser tests also fetch/decode the actual favicon and Apple URLs and assert their exact pixel dimensions.
