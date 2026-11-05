# Owner review 4

Implementation starts from merged Yeswell PR #71 (`34ee4d9`).

## Question requiring owner clarification

The repository currently validates 43-character tokens and passwords, but has no token-lookup rate limiter, failed-password counter, lockout or 429 path. Is the referenced protection configured outside the app (for example a Vercel rule) and therefore to be retained there, or should this PR add app-side protection? If adding it here, proposed default: per-IP limits covering old and new tokens plus failed-password lockout, with generic 404 responses for unknown links. No protection will be silently claimed as already present.

Existing tokens and published PagePlans remain unchanged. The other three review items can progress independently.
