// MarketFresh plan terms. The financed amount also supports the approved connector kickoff calculation.
export const oiotPlan = {
  name: "Own It Over Time",
  kickoffLabel: "Own It Over Time kickoff",
  purchasePriceHelp:
    "Shown in the Own It Over Time terms. This amount isn’t charged.",
  lookupKey: "oiot-monthly-175",
  skus: ["oiot-monthly", "oiot-monthly-175"],
  creditDifference: 225000,
  monthlyAmount: 17500,
  paidPayments: 30,
  stepDownAmount: 10000,
  priceError:
    "The purchase price must equal the kickoff plus $2,250 so payoff happens after 30 payments.",
  billingNote:
    "Early buyout or add-on credits are handled manually — the automatic step-down happens after 30 paid monthly payments.",
};
