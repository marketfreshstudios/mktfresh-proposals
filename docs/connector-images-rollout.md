# Connector links and embedded images

No hosted SQL, storage change, new asset table or new scope is needed.

## Owner decision (November 7)

Match the existing Studio image format: PNG/JPEG under 700 KB, the shared type/magic-byte/dimension checks (16 megapixels), and embedded data in document JSON. WebP/SVG are not accepted. Original bytes remain unchanged, including EXIF. Stripping EXIF/re-encoding is deferred as one shared Studio + connector follow-up; this PR does not add a separate sanitizing pipeline or change Studio limits.

`upload_image` is a validation helper, not an asset upload. It requires `templates:edit` and returns `{ image_ref }`, where the reference is the same `data:image/png|jpeg;base64,...` string Studio embeds. `filename` supplies the PNG/JPEG extension, `content_base64` is just the file bytes in base64, and `alt` is descriptive text to use in Markdown. Claude should resize logos locally first.

## Markdown

```md
![Client logo](IMAGE_REF){width=120}

A short case study. [Visit their website](https://example.test).
```

Replace `IMAGE_REF` with the complete embedded value. An image occupies its own paragraph, optionally followed by `{width=120}`. The width is CSS pixels at the canonical document content width and is converted to the editor's existing percentage sizing; proportions stay locked, minimum height is 16px and maximum width is the content column. Templates use their resolved margins; saved groups use workspace defaults. Responsive editor/client display follows the existing percentage behavior. No new document field is stored.

Groups support images plus text, headings and lists. Text/List saved blocks support links; use Group when an image is included. Plain contract clauses remain plain text. Templates and proposal drafts share the parser. `get_template` and group `get_saved_block` return embedded image syntax and link Markdown, preserving IDs and all unchanged rich data through existing markers. Editing an image's Markdown changes that member rather than inserting a duplicate. Non-embedded or malformed legacy images remain opaque marker-only objects.

HTTPS links, bare HTTPS autolinks and mailto links become normal editor link marks. HTTP, relative, javascript and data links are refused. Data URLs are allowed only for validated standalone PNG/JPEG image blocks, never links. Remote image URLs, opaque `image:` IDs and workspace storage paths are refused; the connector never fetches them. Embedded bytes are intentionally portable, exactly like uploading a local image in Studio; there is no cross-workspace asset lookup.

The prose budget remains 100,000 characters. Total Markdown is bounded at 1,100,000 characters to carry an image under 700 KB; MCP results are capped at 2,000,000 characters so valid image round trips are not cut off by the former text-only response limit. Keep logos small.

The existing starter, scope, revision, preservation-marker, linked-template and explicit-draft-update rules are unchanged. Connector writes never update draft copies, sent proposals or signed versions.
