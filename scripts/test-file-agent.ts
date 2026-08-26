import assert from "node:assert/strict";
import { detectGenericFile } from "../src/lib/file-agent/detect";
import { DEFAULT_FILE_AGENT_LIMITS } from "../src/lib/file-agent/limits";
import { getServerFileAgentLimits } from "../src/lib/file-agent/server-limits";
import { queryTextDataFile } from "../src/lib/file-agent/query-adapter";
import { inspectTextFile, readTextFileChunk, searchTextFile } from "../src/lib/file-agent/text-adapter";

async function main() {
  process.env.FILE_AGENT_MAX_TOOL_RESULT_BYTES = "40960";
  process.env.FILE_AGENT_MAX_MATCHES = "50";
  assert.equal(getServerFileAgentLimits().maxToolResultBytes, 40_960);
  assert.equal(getServerFileAgentLimits().maxMatches, 50);
  delete process.env.FILE_AGENT_MAX_TOOL_RESULT_BYTES;
  delete process.env.FILE_AGENT_MAX_MATCHES;

  const textFile = new File(
    [Array.from({ length: 250 }, (_, index) => `line ${index + 1}: ${index % 40 === 0 ? "needle" : "plain"}`).join("\n")],
    "events.log",
    { type: "text/plain" },
  );
  let textDescriptor = await detectGenericFile("text-1", textFile);
  textDescriptor = await inspectTextFile(textFile, textDescriptor);
  assert.equal(textDescriptor.kind, "text");

  const firstSearch = await searchTextFile({
    file: textFile,
    descriptor: textDescriptor,
    request: { query: "needle", limit: 2 },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.equal(firstSearch.items.length, 2);
  assert.ok(firstSearch.nextCursor);
  const secondSearch = await searchTextFile({
    file: textFile,
    descriptor: textDescriptor,
    request: { query: "needle", limit: 2, cursor: firstSearch.nextCursor },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.ok(secondSearch.items[0].line! > firstSearch.items[1].line!);

  const boundedFile = new File(
    [Array.from({ length: 80 }, (_, index) => `needle ${index} ${"x".repeat(480)}`).join("\n")],
    "bounded.log",
    { type: "text/plain" },
  );
  const boundedDescriptor = await detectGenericFile("bounded-1", boundedFile);
  const boundedResult = await searchTextFile({
    file: boundedFile,
    descriptor: boundedDescriptor,
    request: { query: "needle", limit: 80 },
    limits: { ...DEFAULT_FILE_AGENT_LIMITS, maxToolResultBytes: 4_096 },
    isCancelled: () => false,
  });
  assert.ok(new TextEncoder().encode(JSON.stringify(boundedResult)).byteLength <= 4_096);
  assert.ok(boundedResult.nextCursor);
  assert.equal(JSON.parse(JSON.stringify(boundedResult)).returned, boundedResult.items.length);
  const boundedNext = await searchTextFile({
    file: boundedFile,
    descriptor: boundedDescriptor,
    request: { query: "needle", limit: 80, cursor: boundedResult.nextCursor },
    limits: { ...DEFAULT_FILE_AGENT_LIMITS, maxToolResultBytes: 4_096 },
    isCancelled: () => false,
  });
  assert.ok(boundedNext.items[0].line! > boundedResult.items.at(-1)!.line!);

  const firstChunk = await readTextFileChunk({
    file: textFile,
    descriptor: textDescriptor,
    request: { maxBytes: 1_024 },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.ok(firstChunk.items[0].text.startsWith("line 1"));
  assert.ok(firstChunk.nextCursor);

  const unicodeFile = new File([`${"a".repeat(1_023)}中tail`], "unicode.txt", {
    type: "text/plain",
  });
  const unicodeDescriptor = await detectGenericFile("unicode-1", unicodeFile);
  const unicodeFirst = await readTextFileChunk({
    file: unicodeFile,
    descriptor: unicodeDescriptor,
    request: { maxBytes: 1_024 },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.doesNotMatch(unicodeFirst.items[0].text, /�/);
  const unicodeSecond = await readTextFileChunk({
    file: unicodeFile,
    descriptor: unicodeDescriptor,
    request: { cursor: unicodeFirst.nextCursor, maxBytes: 1_024 },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.equal(unicodeSecond.items[0].text, "中tail");

  const csvFile = new File(
    ["region,revenue\nAU,10\nNZ,20\nAU,15\nIN,7\n"],
    "sales.csv",
    { type: "text/csv" },
  );
  let csvDescriptor = await detectGenericFile("csv-1", csvFile);
  csvDescriptor = await inspectTextFile(csvFile, csvDescriptor);
  assert.equal(csvDescriptor.kind, "csv");
  assert.deepEqual(csvDescriptor.structure.columns, ["region", "revenue"]);
  const aggregate = await queryTextDataFile({
    file: csvFile,
    descriptor: csvDescriptor,
    request: {
      operation: "aggregate",
      groupBy: ["region"],
      metrics: [{ name: "total_revenue", field: "revenue", operation: "sum" }],
      sortBy: "total_revenue",
      direction: "desc",
    },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.deepEqual(aggregate.items[0], { region: "AU", total_revenue: 25 });

  const largeCsvFile = new File(
    [
      "id,value\n",
      Array.from({ length: 50_000 }, (_, index) => `${index + 1},${index % 10}\n`).join(""),
    ],
    "large.csv",
    { type: "text/csv" },
  );
  const largeCsvDescriptor = await detectGenericFile("large-csv", largeCsvFile);
  const largeCount = await queryTextDataFile({
    file: largeCsvFile,
    descriptor: largeCsvDescriptor,
    request: { operation: "count" },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.equal(largeCount.stats?.count, 50_000);

  const jsonlFile = new File(
    ['{"type":"news","score":3}\n{"type":"event","score":8}\n'],
    "items.jsonl",
    { type: "application/x-ndjson" },
  );
  const jsonlDescriptor = await detectGenericFile("jsonl-1", jsonlFile);
  assert.equal(jsonlDescriptor.kind, "jsonl");
  const top = await queryTextDataFile({
    file: jsonlFile,
    descriptor: jsonlDescriptor,
    request: { operation: "top", column: "score", direction: "desc", limit: 1 },
    limits: DEFAULT_FILE_AGENT_LIMITS,
    isCancelled: () => false,
  });
  assert.equal(top.items[0].type, "event");

  const binaryFile = new File([new Uint8Array([0, 1, 0, 2, 0, 3])], "archive.bin");
  const binaryDescriptor = await detectGenericFile("binary-1", binaryFile);
  assert.equal(binaryDescriptor.kind, "binary");
  assert.deepEqual(binaryDescriptor.capabilities, ["inspect"]);
  assert.match(binaryDescriptor.warnings[0], /Convert it/);

  console.log("File agent checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
