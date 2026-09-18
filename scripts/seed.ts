import { runtime } from "../src/lib/runtime";
import { seed } from "../src/lib/seed";
await seed(runtime().repo, process.env.APP_MODE === "local");
console.log("Catalog and sample template seeded; existing mappings preserved.");
