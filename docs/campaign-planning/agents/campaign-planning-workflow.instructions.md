# campaign_planning_workflow

Use this document to configure the top-level workflow agent in AgentSL `Agent Studio`.

## Suggested Agent Metadata

- Agent ID: `campaign_planning_workflow`
- Workflow type: `Sequential Workflow Agent`
- Description: `Orchestrates campaign data analysis, market benchmarking, and route-level recommendation generation for airline campaign planning.`
- Include Memory: `Off` for MVP
- Output Key: optional for workflow-level output aggregation

## Recommended Sub-Agent Order

Add the following sub-agents in this exact order:

1. `campaign_data_agent`
2. `campaign_market_agent`
3. `campaign_recommendation_agent`

When `campaign_proposal_writer_agent` is ready, append it as step 4.

## Why Sequential Workflow

Use a sequential workflow for MVP because each stage depends on the previous stage:

1. `campaign_data_agent` produces `data_findings`
2. `campaign_market_agent` uses the shortlisted routes to produce `market_findings`
3. `campaign_recommendation_agent` combines both upstream outputs into `campaign_recommendation`

This keeps orchestration deterministic and easier to debug than a planner-based or parallel design.

## Expected State Handoff

The workflow should rely on these output keys:

- `campaign_data_agent` -> `data_findings`
- `campaign_market_agent` -> `market_findings`
- `campaign_recommendation_agent` -> `campaign_recommendation`

If AgentSL exposes session state during workflow execution, ensure downstream agents can access these keys.

## Optional Workflow Instruction

If AgentSL requires a workflow-level instruction or description field beyond the workflow definition, use this text:

```markdown
Run the campaign planning sequence in a deterministic order.

All workflow stages operate as Singapore Airlines employees. Preserve a Singapore Airlines-first perspective when analyzing data, interpreting market context, and producing recommendations. Prioritize Singapore Airlines' commercial performance, brand reputation, customer experience, long-term yield, compliance, and auditability.

1. Analyze uploaded sales data first.
2. Benchmark the resulting candidate routes against market fare context.
3. Produce route-level campaign recommendations only after both upstream stages are complete.

Do not skip stages. Do not reorder stages. Preserve upstream data gaps and warnings for downstream agents.
```

## Recommended Runner Prompt For End-to-End Test

Use a prompt like this in Runner Console after the workflow is created:

```text
Create a long-haul promotion recommendation using the uploaded Jul-Dec sales file. Identify the best candidate routes, benchmark them against market pricing, and return route-level campaign recommendations with risks and assumptions.
```

## Expected MVP Output After Step 3

At this stage the workflow should return recommendation-layer output, not a final GM proposal yet. The expected top-level result is:

- route-level campaign recommendations
- impact assessment
- risks and assumptions
- decision notes

The final GM-facing proposal should be produced only after you add `campaign_proposal_writer_agent` as the final stage.

## Debugging Guidance

If workflow execution fails, isolate the failing stage in this order:

1. Run `campaign_data_agent` alone
2. Run `campaign_market_agent` with a fixed test route payload
3. Run `campaign_recommendation_agent` with known-good upstream JSON

Do not debug the full workflow first if one of the individual stages is still unstable.

## Notes

- Keep this workflow deterministic for MVP.
- Do not add a planner agent yet.
- Do not parallelize market benchmarking and recommendation generation yet.
- Add `campaign_proposal_writer_agent` only after the first three stages are stable in Runner Console.
