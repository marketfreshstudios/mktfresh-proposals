import { readFile } from "node:fs/promises";
import { runtime } from "../../src/lib/runtime";
import { importCsv, uploadPdfs } from "./core";
const [command, path] = process.argv.slice(2);
if (!path || !["csv", "upload"].includes(command))
  throw new Error(
    "Usage: npm run import -- csv export.csv | upload pdf-directory",
  );
const { repo, storage } = runtime();
const report =
  command === "csv"
    ? await importCsv(repo, await readFile(path, "utf8"))
    : await uploadPdfs(repo, storage, path);
console.log(JSON.stringify(report, null, 2));
if (
  "errors" in report &&
  (report.errors.length || report.missing_pdf.length || report.unmatched.length)
)
  process.exitCode = 1;
