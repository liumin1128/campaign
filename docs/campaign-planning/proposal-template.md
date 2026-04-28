# {{campaign.campaign_name}}

## 1. Campaign Objective

{{campaign.objective}}

Planning window: {{campaign.planning_window.start_date}} to {{campaign.planning_window.end_date}}

Travel window: {{campaign.travel_window.start_date}} to {{campaign.travel_window.end_date}}

Target segments: {{campaign.target_segments}}

## 2. Executive Summary

### Headline

{{executive_summary.headline}}

### Summary

{{executive_summary.summary}}

### Decision Ask

{{executive_summary.decision_ask}}

## 3. Input Summary

### Brief

{{input_summary.brief}}

### Source Files

{{#input_summary.source_files}}
- {{file_name}}: {{description}} ({{mime_type}})
{{/input_summary.source_files}}

### Data Coverage

{{#input_summary.data_coverage}}
- {{.}}
{{/input_summary.data_coverage}}

### Business Constraints

{{#input_summary.business_constraints}}
- {{.}}
{{/input_summary.business_constraints}}

## 4. Key Findings

{{#key_findings}}
### {{title}}

{{statement}}

Severity: {{severity}}

Evidence:

{{#evidence}}
- {{.}}
{{/evidence}}
{{/key_findings}}

## 5. Market Benchmark

{{#market_benchmarks}}
### {{route.origin}} to {{route.destination}}

- Travel window: {{travel_window.start_date}} to {{travel_window.end_date}}
- Reference market price: {{reference_market_price.amount}} {{reference_market_price.currency}}
- Competitor summary: {{competitor_summary}}
- Source: {{source_reference}}
{{/market_benchmarks}}

## 6. Recommended Actions

{{#recommendations}}
### Priority {{priority}}: {{route.origin}} to {{route.destination}}

- Recommendation type: {{recommendation_type}}
- Reference market price: {{reference_market_price.amount}} {{reference_market_price.currency}}
- Proposed price: {{proposed_price.amount}} {{proposed_price.currency}}
- Recommended discount: {{recommended_discount.amount}} {{recommended_discount.currency}}
- Confidence: {{confidence}}

Rationale:

{{#rationale}}
- {{.}}
{{/rationale}}

Expected effect: {{expected_effect}}
{{/recommendations}}

## 7. Expected Impact

{{#impact_assessment.expected_outcomes}}
### {{metric}}

- Direction: {{direction}}
- Target value: {{target_value}}
- Explanation: {{explanation}}
{{/impact_assessment.expected_outcomes}}

### Measurement Plan

{{#impact_assessment.measurement_plan}}
- {{.}}
{{/impact_assessment.measurement_plan}}

## 8. Risks and Assumptions

### Risks

{{#risks_and_assumptions.risks}}
- {{title}}: {{detail}}
{{/risks_and_assumptions.risks}}

### Assumptions

{{#risks_and_assumptions.assumptions}}
- {{title}}: {{detail}}
{{/risks_and_assumptions.assumptions}}

### Data Gaps

{{#risks_and_assumptions.data_gaps}}
- {{title}}: {{detail}}
{{/risks_and_assumptions.data_gaps}}

## 9. Appendix

### Supporting Tables

{{#appendix.supporting_tables}}
- {{table_name}}: {{description}} {{file_name}}
{{/appendix.supporting_tables}}

### Citations

{{#appendix.citations}}
- [{{source_type}}] {{reference}}: {{usage}}
{{/appendix.citations}}

---

Proposal ID: {{proposal_metadata.proposal_id}}

Generated at: {{proposal_metadata.generated_at}}

Generator version: {{proposal_metadata.generator_version}}