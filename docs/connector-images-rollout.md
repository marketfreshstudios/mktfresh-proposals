# Connector links and images

## Implementation check

Studio body-image uploads currently accept PNG/JPEG under 700 KB and embed a data URL in block JSON. The cover-image validator additionally decodes with a 16-megapixel limit. These paths do not re-encode the original or store body-image assets in Storage. The private `proposal-files` bucket already exists for other files.

Pending owner decision: keep Studio behavior and limits unchanged; make `upload_image` accept PNG/JPEG/WebP under 700 KB / 16 megapixels, decode and re-encode a sanitized PNG, and store it privately under a workspace-scoped immutable image reference. Resolve that reference to an embedded sanitized snapshot in document blocks, so existing editor/client/PDF rendering stays unchanged. Markdown uses `![alt](image:IMAGE_REF){width=120}`. No remote fetch and no SQL expected.

Links are independent: HTTPS and mailto links become existing editor link marks; other schemes, relative paths and HTTP are refused. Existing opaque preservation-marker and starter rules remain in force.
