/** Offline regression check. VERCEL=1 exercises packaged Linux Chromium on CI. */
import {
  regressionKinds,
  verifyPdfJobs,
} from "../tests/fixtures/pdf-job-regression";
process.env.APP_MODE = "local";
process.env.BILLING_MODE = "mock";
process.env.APP_URL = "http://127.0.0.1:3100";
for (const kind of regressionKinds) console.log(await verifyPdfJobs(kind));
