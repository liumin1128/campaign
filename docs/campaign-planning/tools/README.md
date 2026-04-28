# Campaign Tools

This folder contains the Tool Studio artifacts for the campaign planning MVP.

## campaign_csv_analyzer

Files:

- `campaign-csv-analyzer.openapi.yaml`: OpenAPI 3.0 definition to register in AgentSL Tool Studio.
- `campaign-csv-analyzer.examples.json`: sample Runner API payload, tool request body, and success response.

## market_fare_benchmark_tool

Files:

- `market-fare-benchmark.openapi.yaml`: OpenAPI 3.0 definition to register the market benchmark tool in AgentSL Tool Studio.
- `market-fare-benchmark.examples.json`: sample request and response payloads for route-level fare benchmarking.

## What This Tool Does

`campaign_csv_analyzer` is the first tool in the pipeline. It should:

1. Receive uploaded sales CSV files from AgentSL file routing.
2. Validate the file schema and date coverage.
3. Aggregate route-level commercial performance.
4. Score campaign opportunities for long-haul promotions.
5. Return candidate routes and findings in a deterministic JSON shape.

## Tool Studio Setup

In AgentSL Tool Studio:

1. Create a new tool.
2. Select `OpenAPI` as the tool type.
3. Paste `campaign-csv-analyzer.openapi.yaml` into the editor.
4. Use the production `servers.url` defined in the OpenAPI file. Do not replace it with a temporary preview domain such as `*.vercel.app`.
5. For this Next.js app, the actual callable paths must include the `/api` prefix, for example `/api/campaign-tools/analyze-sales-csv`.
6. Replace the contact name and email in the OpenAPI `info.contact` section.
7. Save the tool.

## TLS Troubleshooting

If Agent Runner fails with `CERTIFICATE_VERIFY_FAILED`, verify that you are using the production hostname and not a temporary preview domain. See `agent-runner-tls-troubleshooting.md` in this folder for the exact checks and the summary you can send to platform or network teams.

## Important AgentSL Rules

1. `agentsl_s3_context` must remain a required request property. If you remove it, AgentSL will not route uploaded files to the tool.
2. AgentSL does not read CSV content itself. File routing depends mainly on the file description sent through Runner API `metadata.file_metadata`.
3. The tool should do all numerical aggregation itself. The agent should not derive route metrics from free-form prompt text.
4. If the tool emits supporting files, it should return `file_metadata` so those artifacts persist for downstream steps.

## Recommended File Description

Use a file description like this when calling Runner API:

`Jul to Dec route-level sales data with origin, destination, cabin, passengers, revenue, yield, booking date and travel date`

This is specific enough for the data agent to route the CSV to this tool.

## Recommended Downstream Contract

The next agent, `campaign_data_agent`, should normalize the tool output into:

- `key_findings`
- `appendix.supporting_tables`
- initial candidate route shortlist for market benchmarking

Do not let the data agent invent metrics that are missing from tool output. Missing fields should be surfaced as data gaps.