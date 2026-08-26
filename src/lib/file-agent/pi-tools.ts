"use client";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import {
  inspectGenericFile,
  queryGenericFile,
  readGenericFile,
  searchGenericFile,
} from "./file-worker-client";
import type { GenericFileContext } from "./types";

const scalarSchema = Type.Union([Type.String(), Type.Number()]);
const filterSchema = Type.Object(
  {
    field: Type.String(),
    op: Type.Union([
      Type.Literal("eq"),
      Type.Literal("contains"),
      Type.Literal("gte"),
      Type.Literal("lte"),
      Type.Literal("between"),
      Type.Literal("notEmpty"),
    ]),
    value: Type.Optional(
      Type.Union([scalarSchema, Type.Tuple([scalarSchema, scalarSchema])]),
    ),
  },
  { additionalProperties: false },
);
const metricSchema = Type.Object(
  {
    name: Type.String(),
    field: Type.String(),
    operation: Type.Union([
      Type.Literal("sum"),
      Type.Literal("avg"),
      Type.Literal("min"),
      Type.Literal("max"),
      Type.Literal("count"),
    ]),
  },
  { additionalProperties: false },
);

type GenericFileTool =
  | ReturnType<typeof createInspectTool>
  | ReturnType<typeof createSearchTool>
  | ReturnType<typeof createReadTool>
  | ReturnType<typeof createQueryTool>;

export function createGenericFileAgentTools(
  contexts: GenericFileContext[],
): AgentTool[] {
  if (contexts.length === 0) return [];
  const tools: GenericFileTool[] = [
    createInspectTool(contexts),
    createSearchTool(contexts),
    createReadTool(contexts),
    createQueryTool(contexts),
  ];
  return tools as unknown as AgentTool[];
}

function createInspectTool(contexts: GenericFileContext[]) {
  const parameters = Type.Object(
    { fileId: Type.String({ description: "File id from the attached-file catalog" }) },
    { additionalProperties: false },
  );
  return {
    name: "inspect_file",
    label: "Inspect File",
    description:
      "Inspect an attached file before reading it. Returns its detected type, size, encoding, structure, supported capabilities, sample, and preprocessing warnings without loading the full file into the model.",
    parameters,
    async execute(_toolCallId, params, signal) {
      requireContext(contexts, params.fileId);
      const descriptor = await inspectGenericFile(params.fileId, signal);
      return {
        content: [{ type: "text", text: JSON.stringify(descriptor) }],
        details: { fileId: params.fileId, kind: descriptor.kind },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function createSearchTool(contexts: GenericFileContext[]) {
  const parameters = Type.Object(
    {
      fileId: Type.String({ description: "File id from the attached-file catalog" }),
      query: Type.String(),
      mode: Type.Optional(Type.Union([Type.Literal("literal"), Type.Literal("regex")])),
      ignoreCase: Type.Optional(Type.Boolean()),
      cursor: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number()),
    },
    { additionalProperties: false },
  );
  return {
    name: "search_file",
    label: "Search File",
    description:
      "Search a supported text file without returning the whole file. Use literal mode by default or regex when needed. Results contain bounded matching lines and an optional nextCursor for continuation.",
    parameters,
    async execute(_toolCallId, params, signal) {
      requireContext(contexts, params.fileId);
      const result = await searchGenericFile(
        params.fileId,
        {
          query: params.query,
          mode: params.mode,
          ignoreCase: params.ignoreCase,
          cursor: params.cursor,
          limit: params.limit,
        },
        signal,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: { fileId: params.fileId, matches: result.returned },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function createReadTool(contexts: GenericFileContext[]) {
  const parameters = Type.Object(
    {
      fileId: Type.String({ description: "File id from the attached-file catalog" }),
      cursor: Type.Optional(Type.String()),
      maxBytes: Type.Optional(Type.Number()),
    },
    { additionalProperties: false },
  );
  return {
    name: "read_file_chunk",
    label: "Read File Chunk",
    description:
      "Read one bounded chunk from a supported text file. Never request the whole large file. Continue only when the returned nextCursor is relevant to the user's question.",
    parameters,
    async execute(_toolCallId, params, signal) {
      requireContext(contexts, params.fileId);
      const result = await readGenericFile(
        params.fileId,
        { cursor: params.cursor, maxBytes: params.maxBytes },
        signal,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: { fileId: params.fileId, returned: result.returned },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function createQueryTool(contexts: GenericFileContext[]) {
  const parameters = Type.Object(
    {
      fileId: Type.String({ description: "File id from the attached-file catalog" }),
      operation: Type.Union([
        Type.Literal("profile"),
        Type.Literal("count"),
        Type.Literal("distinct"),
        Type.Literal("stats"),
        Type.Literal("filter"),
        Type.Literal("aggregate"),
        Type.Literal("top"),
      ]),
      column: Type.Optional(Type.String()),
      columns: Type.Optional(Type.Array(Type.String())),
      filters: Type.Optional(Type.Array(filterSchema)),
      groupBy: Type.Optional(Type.Array(Type.String())),
      metrics: Type.Optional(Type.Array(metricSchema)),
      sortBy: Type.Optional(Type.String()),
      direction: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
      limit: Type.Optional(Type.Number()),
      cursor: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  );
  return {
    name: "query_file",
    label: "Query File",
    description:
      "Run a bounded local query over CSV, TSV, JSONL, or reasonably sized JSON. Supports profile, count, distinct, stats, filter, aggregate, and top operations. Prefer this over reading raw rows when the question needs totals or comparisons.",
    parameters,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal) {
      requireContext(contexts, params.fileId);
      const result = await queryGenericFile(
        params.fileId,
        {
          operation: params.operation,
          column: params.column,
          columns: params.columns,
          filters: params.filters,
          groupBy: params.groupBy,
          metrics: params.metrics,
          sortBy: params.sortBy,
          direction: params.direction,
          limit: params.limit,
          cursor: params.cursor,
        },
        signal,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: { fileId: params.fileId, operation: params.operation },
      };
    },
  } satisfies AgentTool<typeof parameters>;
}

function requireContext(contexts: GenericFileContext[], fileId: string) {
  const context = contexts.find((item) => item.id === fileId);
  if (!context) throw new Error(`Unknown or expired file id: ${fileId}`);
  return context;
}
