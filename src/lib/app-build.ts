/** Public deployment metadata only; never pass the complete environment to clients. */
export function buildIdentity(
  env: Record<string, string | undefined>,
  fallback: string,
) {
  return (
    env.YESWELL_BUILD_ID ||
    env.VERCEL_DEPLOYMENT_ID ||
    [env.VERCEL_GIT_COMMIT_SHA, env.VERCEL_URL].filter(Boolean).join(":") ||
    fallback
  );
}
export const appBuildId =
  process.env.NEXT_PUBLIC_YESWELL_BUILD_ID ?? "development";
export const buildPollMs = 5 * 60 * 1000;
export const buildSnoozeMs = 30 * 60 * 1000;
