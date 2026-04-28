# Campaign Proposal Contract

This folder defines the output contract for the AI-driven Campaign Planning and Execution engine MVP.

## Files

- `proposal.schema.json`: the machine-readable schema that every final proposal JSON must satisfy.
- `proposal-template.md`: the human-facing proposal layout for GM review.

## Why This Exists

The engine should not jump directly from CSV input to a PDF without a stable intermediate contract. The stable flow for MVP is:

1. Tools produce structured findings.
2. Agents synthesize those findings into a JSON object that matches `proposal.schema.json`.
3. A renderer converts the JSON into `proposal-template.md` or HTML.
4. A PDF tool converts the rendered document into the final PDF.

This separation keeps the system auditable and makes failures easier to debug.

## Design Rules

1. All numeric claims in the proposal must trace back to tool outputs or explicit user input.
2. Recommendations must be route-specific and include benchmark price, proposed price, and discount.
3. The final proposal must include risks, assumptions, and data gaps.
4. The PDF generator should render from proposal JSON, not from free-form model text.

## Recommended Agent Responsibilities

- Data analysis agents populate `key_findings` and appendix tables.
- Market benchmark agents populate `market_benchmarks`.
- Recommendation agents populate `recommendations` and `impact_assessment`.
- Proposal writer agents populate `executive_summary` and normalize the full JSON to the schema.

## Example Route Recommendation

```json
{
  "priority": 1,
  "route": {
    "origin": "Beijing",
    "destination": "Cape Town"
  },
  "recommendation_type": "discount",
  "recommended_discount": {
    "amount": 600,
    "currency": "CNY"
  },
  "proposed_price": {
    "amount": 4600,
    "currency": "CNY"
  },
  "reference_market_price": {
    "amount": 5200,
    "currency": "CNY"
  },
  "rationale": [
    "Demand softened in the target period while long-haul interest remains recoverable.",
    "The current market benchmark leaves room for a tactical fare reduction without becoming the lowest fare in market."
  ],
  "expected_effect": "Improve booking conversion for shoulder-period departures.",
  "confidence": "medium"
}
```

## What To Build Next

1. A CSV analysis tool that returns structured route findings.
2. A market fare benchmark tool that returns comparable public or internal market prices.
3. A proposal renderer that accepts proposal JSON and produces markdown or HTML.
4. A PDF tool that renders the final document.