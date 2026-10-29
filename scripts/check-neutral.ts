import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const forbidden =
  /marketfresh|own it over time|oiot-monthly|hosted-standard-100|visibility-growth|build_credit_cents|price_base|price_per_unit/i;
async function check(dir: string): Promise<void> {
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, f.name);
    if (f.isDirectory()) await check(path);
    else if (
      /\.(ts|tsx|css)$/.test(path) &&
      forbidden.test(await readFile(path, "utf8"))
    )
      throw new Error(
        `Workspace-specific business rule in ${path}; move to seed data`,
      );
  }
}
await check("src");
console.log("Application code contains no seed-specific business rules.");
