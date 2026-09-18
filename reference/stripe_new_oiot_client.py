#!/usr/bin/env python3
"""
Create an "Own It Over Time" subscription for a new client.

DRY RUN by default. Nothing is created until you pass --apply.

What it does:
  1. Finds or creates the Product  "Own It Over Time - Website Plan"
  2. Finds or creates the Price    $175.00 / month   (lookup_key: oiot-monthly-175)
     -> reused by every future OIOT client, so this only happens once
  3. Finds or creates the Customer (matched on email)
  4. Creates a Stripe Checkout link that starts the $175/month
     subscription. The first invoice charges the first month immediately,
     then $175/month automatically thereafter.
  5. Stamps the buyout math onto the subscription as metadata so the
     number is still recoverable in 14 months.

The KICKOFF is NOT charged here - it is invoiced separately in QuickBooks.
It is still recorded below because it reduces the buyout price, and the
buyout number is wrong without it.

You send the client the link. They enter their own card - the card never
touches you, this chat, or this script.

Usage:
    python3 stripe_new_oiot_client.py                 # dry run
    python3 stripe_new_oiot_client.py --apply         # actually create
"""

import sys, json, getpass, urllib.request, urllib.parse, urllib.error

# ============================================================
# FILL THIS IN  ---------------------------------------------
# ============================================================
CLIENT_NAME   = "Carolina Dock Construction"
CLIENT_EMAIL  = "skiwylie@gmail.com"
CONTACT_NAME  = "Julia Todd"   # the person; CLIENT_NAME is the business

KICKOFF       = 1125.00      # design & build deposit - BILLED IN QUICKBOOKS,
                            # not charged by this script. Recorded because it
                            # comes off the buyout price.
FULL_PRICE    = 3750.00     # what the site would cost outright (Own It Now)

PAGES         = 9           # for the record only
SUCCESS_URL   = "https://mktfresh.com/welcome/"
CANCEL_URL    = "https://mktfresh.com/"
# ============================================================

MONTHLY       = 175.00      # locked - do not change per client
BUILD_CREDIT  = 75.00       # locked - the portion that buys down the site
TERM_MONTHS   = 12
LOOKUP_KEY    = "oiot-monthly-175"
PRODUCT_NAME  = "Own It Over Time - Website Plan"

APPLY = "--apply" in sys.argv
API   = "https://api.stripe.com/v1/"


def call(method, path, data=None):
    url = API + path
    body = None
    if data:
        body = urllib.parse.urlencode(data, doseq=True).encode()
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", "Bearer " + KEY)
    if body:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = json.load(e).get("error", {}).get("message", "")
        sys.exit(f"\nStripe error on {method} {path}:\n  {detail}\n")


def money(x):
    return "${:,.2f}".format(x)


# ---------- sanity checks before we touch anything ----------
problems = []
if not CLIENT_NAME.strip():
    problems.append("CLIENT_NAME is empty")
if "@" not in CLIENT_EMAIL:
    problems.append("CLIENT_EMAIL is empty or not an email address")
if KICKOFF <= 0:
    problems.append("KICKOFF must be greater than zero")
if FULL_PRICE <= KICKOFF:
    problems.append("FULL_PRICE must be greater than KICKOFF")
if problems:
    print("Fill in the settings at the top of this file first:\n")
    for p in problems:
        print("  -", p)
    sys.exit(1)

financed   = FULL_PRICE - KICKOFF
months     = financed / BUILD_CREDIT
at_signing = KICKOFF + MONTHLY   # what the client owes in total at signing, across both systems

print("=" * 62)
print("OWN IT OVER TIME - NEW CLIENT" + ("   [APPLY]" if APPLY else "   [DRY RUN]"))
print("=" * 62)
print(f"  Client            {CLIENT_NAME}")
print(f"  Contact           {CONTACT_NAME}  <{CLIENT_EMAIL}>")
print(f"  Pages             {PAGES}")
print()
print(f"  Full price        {money(FULL_PRICE)}")
print(f"  Kickoff           {money(KICKOFF)}")
print(f"  Financed          {money(financed)}")
print()
print(f"  CHARGED BY STRIPE {money(MONTHLY)} now, then {money(MONTHLY)}/mo")
print(f"  BILLED IN QUICKBOOKS  {money(KICKOFF)} kickoff - invoice this separately, at signing")
print(f"  Build credit      {money(BUILD_CREDIT)}/mo of that buys down the site")
print(f"  Buyout hits $0    after {months:.0f} monthly payments"
      f"  (~{months/12:.1f} years)")
print(f"  Minimum term      {TERM_MONTHS} months  (Stripe does NOT enforce this - it lives in the contract)")
print("=" * 62)

if not APPLY:
    print("\nDRY RUN - nothing was created.")
    print("If the numbers above are right, run again with --apply\n")
    sys.exit(0)

KEY = getpass.getpass("\nStripe restricted key (rk_... or sk_...): ").strip()
if not KEY.startswith(("sk_", "rk_")):
    sys.exit("That doesn't look like a Stripe secret or restricted key "
             "(should start with sk_ or rk_).")

# ---------- 1 & 2. product + price (created once, reused forever) ----------
found = call("GET", f"prices?lookup_keys[]={LOOKUP_KEY}&limit=1")["data"]
if found:
    price_id = found[0]["id"]
    print(f"\n  price    reusing {price_id}  ({money(found[0]['unit_amount']/100)}/mo)")
    if found[0]["unit_amount"] != int(MONTHLY * 100):
        sys.exit(f"  STOP: existing price is {money(found[0]['unit_amount']/100)}, "
                 f"expected {money(MONTHLY)}. Investigate before continuing.")
else:
    prod = call("POST", "products", {
        "name": PRODUCT_NAME,
        "description": "Website build, hosting, updates, security, backups and "
                       "monthly edit time. A portion of each payment buys down "
                       "the purchase price of the site.",
    })
    price = call("POST", "prices", {
        "product": prod["id"],
        "unit_amount": int(MONTHLY * 100),
        "currency": "usd",
        "recurring[interval]": "month",
        "lookup_key": LOOKUP_KEY,
        "nickname": "Own It Over Time - $175/mo",
    })
    price_id = price["id"]
    print(f"\n  product  created {prod['id']}")
    print(f"  price    created {price_id}")

# ---------- 3. customer ----------
q = urllib.parse.quote(f"email:'{CLIENT_EMAIL}'")
hits = call("GET", f"customers/search?query={q}&limit=1")["data"]
if hits:
    cust_id = hits[0]["id"]
    print(f"  customer reusing {cust_id}")
else:
    cust = call("POST", "customers", {
        "name": CLIENT_NAME,
        "email": CLIENT_EMAIL,
        "metadata[plan]": "own-it-over-time",
        "metadata[contact]": CONTACT_NAME,
        "description": f"{CLIENT_NAME} - Own It Over Time ({CONTACT_NAME})",
    })
    cust_id = cust["id"]
    print(f"  customer created {cust_id}")

# ---------- 4. checkout link: kickoff + first month, then recurring ----------
session = call("POST", "checkout/sessions", {
    "mode": "subscription",
    "customer": cust_id,
    "success_url": SUCCESS_URL,
    "cancel_url": CANCEL_URL,
    "payment_method_collection": "always",

    # recurring line - $175/mo. The kickoff is NOT here; it goes out in QuickBooks.
    "line_items[0][price]": price_id,
    "line_items[0][quantity]": 1,

    # the buyout math, stamped where it survives
    "subscription_data[metadata][plan]":              "own-it-over-time",
    "subscription_data[metadata][full_price]":        f"{FULL_PRICE:.2f}",
    "subscription_data[metadata][kickoff_qbo]":       f"{KICKOFF:.2f}",
    "subscription_data[metadata][build_credit_mo]":   f"{BUILD_CREDIT:.2f}",
    "subscription_data[metadata][buyout_at_signing]": f"{financed:.2f}",
    "subscription_data[metadata][term_months]":       str(TERM_MONTHS),
    "subscription_data[metadata][pages]":             str(PAGES),
})

print("\n" + "=" * 62)
print("DONE. Send the client this link:\n")
print("  " + session["url"])
print(f"\nThey enter their card. Stripe charges {money(MONTHLY)} immediately, "
      f"then {money(MONTHLY)}/mo automatically.")
print(f"REMEMBER: invoice the {money(KICKOFF)} kickoff separately in QuickBooks.")
print("The link expires in 24 hours - re-run this script for a fresh one.")
print("=" * 62 + "\n")
