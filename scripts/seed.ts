import { runtime } from "../src/lib/runtime";
import { seed } from "../seed/marketfresh";
await seed(runtime().repo, process.env.APP_MODE === "local");
console.log("Catalog and sample template seeded; existing mappings preserved.");
