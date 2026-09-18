#!/usr/bin/env python3
"""
Attach the automatic step-down to an Own It Over Time subscription.

Run this AFTER the client has completed checkout and the $175/mo
subscription exists.

It converts the subscription into a Stripe subscription schedule:

    Phase 1   $175/mo  x N cycles      <- N computed from the buyout math
    Phase 2   $100/mo  forever         <- Hosted Standard, hosting + care

Stripe performs the switch itself on the renewal date. There is nothing
to monitor and nothing to remember.

DRY RUN by default.

Usage:
    python3 stripe_oiot_schedule.py sub_1ABC...            # dry run
    python3 stripe_oiot_schedule.py sub_1ABC... --apply
"""

import sys, json, math, getpass, urllib.request, urllib.parse, urllib.error

MONTHLY      = 175.00
BUILD_CREDIT = 75.00
AFTER        = 100.00                  # Hosted Standard
AFTER_LOOKUP = "hosted-standard-100"
OIOT_LOOKUP  = "oiot-monthly-175"

API   = "https://api.stripe.com/v1/"
args  = [a for a in sys.argv[1:] if not a.startswith("--")]
APPLY = "--apply" in sys.argv

if not args or not args[0].startswith("sub_"):
    sys.exit("Usage: python3 stripe_oiot_schedule.py sub_XXXX [--apply]")
SUB_ID = args[0]


def call(method, path, data=None):
    body = urllib.parse.urlencode(data, doseq=True).encode() if data else None
    req = urllib.request.Request(API + path, data=body, method=method)
    req.add_header("Authorization", "Bearer " + KEY)
    if body:
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"\nStripe error on {method} {path}:\n  "
                 + json.load(e).get("error", {}).get("message", "") + "\n")


def money(x): return "${:,.2f}".format(x)


KEY = getpass.getpass("Stripe restricted key (rk_... or sk_...): ").strip()
if not KEY.startswith(("sk_", "rk_")):
    sys.exit("That doesn't look like a Stripe secret or restricted key "
             "(should start with sk_ or rk_).")

sub = call("GET", f"subscriptions/{SUB_ID}")
md  = sub.get("metadata", {})

if sub["status"] not in ("active", "trialing"):
    sys.exit(f"Subscription is '{sub['status']}', not active. Stopping.")
if sub.get("schedule"):
    sys.exit(f"This subscription already has a schedule ({sub['schedule']}). "
             "Stopping so we don't create a second one.")

# ---- the buyout math must be present, or the step-down date is a guess ----
missing = [k for k in ("full_price", "kickoff_qbo", "build_credit_mo")
           if k not in md]
if missing:
    sys.exit("This subscription is missing buyout metadata: "
             + ", ".join(missing) +
             "\nAdd it in the Stripe dashboard first, or the step-down "
             "date would be a guess.")

full     = float(md["full_price"])
kickoff  = float(md["kickoff_qbo"])
credit   = float(md["build_credit_mo"])
financed = full - kickoff
needed   = math.ceil(financed / credit)

# how many $175 invoices have actually been PAID already
paid, more, start = 0, True, None
while more:
    q = f"invoices?subscription={SUB_ID}&status=paid&limit=100"
    if start: q += f"&starting_after={start}"
    page = call("GET", q)
    for inv in page["data"]:
        if inv["amount_paid"] >= int(MONTHLY * 100):
            paid += 1
    more  = page["has_more"]
    start = page["data"][-1]["id"] if page["data"] else None

remaining = max(needed - paid, 0)

print("\n" + "=" * 64)
print("OWN IT OVER TIME - AUTOMATIC STEP-DOWN" + ("   [APPLY]" if APPLY else "   [DRY RUN]"))
print("=" * 64)
print(f"  Subscription      {SUB_ID}")
print(f"  Customer          {sub['customer']}")
print()
print(f"  Full price        {money(full)}")
print(f"  Kickoff (QBO)     {money(kickoff)}")
print(f"  Financed          {money(financed)}")
print(f"  Credit per month  {money(credit)}")
print()
print(f"  Payments needed   {needed}")
print(f"  Already paid      {paid}")
print(f"  REMAINING AT $175 {remaining}")
print()
print(f"  Then drops to     {money(AFTER)}/mo (Hosted Standard) automatically, forever")
print(f"  Buyout reaches    $0 at the end of phase 1 - ownership transfers per "
      f"section 4.4")
print("=" * 64)

if remaining == 0:
    print("\nThis client has already paid it off. Don't schedule - switch the")
    print("price now and transfer ownership.\n")
    sys.exit(0)

if not APPLY:
    print("\nDRY RUN - nothing was changed.")
    print("If those numbers are right, run again with --apply\n")
    sys.exit(0)

# ---- resolve both prices ----
def price_for(lookup, expect, name, desc):
    hit = call("GET", f"prices?lookup_keys[]={lookup}&limit=1")["data"]
    if hit:
        if hit[0]["unit_amount"] != int(expect * 100):
            sys.exit(f"STOP: price '{lookup}' is "
                     f"{money(hit[0]['unit_amount']/100)}, expected {money(expect)}.")
        return hit[0]["id"]
    prod = call("POST", "products", {"name": name, "description": desc})
    return call("POST", "prices", {
        "product": prod["id"], "unit_amount": int(expect * 100),
        "currency": "usd", "recurring[interval]": "month",
        "lookup_key": lookup, "nickname": name,
    })["id"]

p175 = price_for(OIOT_LOOKUP, MONTHLY, "Own It Over Time - $175/mo", "")
p100 = price_for(AFTER_LOOKUP, AFTER, "Hosted Standard - $100/mo",
                 "Hosting, WordPress updates, security, backups, monthly edit time.")

# ---- convert to a schedule, then set the two phases ----
sched = call("POST", "subscription_schedules", {"from_subscription": SUB_ID})
cur   = sched["phases"][0]

call("POST", f"subscription_schedules/{sched['id']}", {
    "end_behavior": "release",
    "phases[0][items][0][price]":    p175,
    "phases[0][items][0][quantity]": 1,
    "phases[0][start_date]":         cur["start_date"],
    "phases[0][iterations]":         remaining,
    "phases[0][proration_behavior]": "none",
    "phases[1][items][0][price]":    p100,
    "phases[1][items][0][quantity]": 1,
    "phases[1][proration_behavior]": "none",
    "metadata[step_down_from]":      "175",
    "metadata[step_down_to]":        "100",
    "metadata[payments_at_175]":     str(needed),
})

print(f"\n  schedule created {sched['id']}")
print(f"  {remaining} more payments at {money(MONTHLY)}, then {money(AFTER)}/mo automatically.\n")
