import { runtime } from "../src/lib/runtime";
import { StripeHttp } from "../src/lib/providers/stripe-http";
import { syncStripeCatalog } from "../src/lib/catalog";
// Never fall back to STRIPE_KEY or ambient Stripe CLI configuration.
const repo = runtime().repo;
const api = new StripeHttp(process.env.STRIPE_SECRET_KEY ?? "", repo);
console.log(await syncStripeCatalog(repo, api));
