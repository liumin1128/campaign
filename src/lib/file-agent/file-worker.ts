import { detectGenericFile } from "./detect";
import { queryTextDataFile } from "./query-adapter";
import { inspectTextFile, readTextFileChunk, searchTextFile } from "./text-adapter";
import { readXlsxFileChunk, searchXlsxFile } from "./xlsx-adapter";
import {
  inspectXlsxWorkbook,
  loadXlsxWorkbook,
  type XlsxWorkbook,
} from "./xlsx-workbook";
import type {
  FileAgentLimits,
  FileWorkerRequest,
  FileWorkerResponse,
  GenericFileDescriptor,
} from "./types";

let file: File | undefined;
let descriptor: GenericFileDescriptor | undefined;
let limits: FileAgentLimits | undefined;
let workbook: XlsxWorkbook | undefined;
const cancelledRequests = new Set<string>();

self.onmessage = async (event: MessageEvent<FileWorkerRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelledRequests.add(request.targetId);
    return;
  }

  let response: FileWorkerResponse;
  try {
    response = await handleRequest(request);
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    cancelledRequests.delete(request.id);
  }
  self.postMessage(response);
};

async function handleRequest(
  request: Exclude<FileWorkerRequest, { type: "cancel" }>,
): Promise<FileWorkerResponse> {
  if (request.type === "register") {
    if (request.file.size > request.limits.maxFileBytes) {
      throw new Error(
        `File exceeds the configured ${request.limits.maxFileBytes} byte limit. Split or preprocess it before upload.`,
      );
    }
    file = request.file;
    limits = request.limits;
    workbook = undefined;
    descriptor = await detectGenericFile(request.fileId, request.file);
    if (
      descriptor.kind === "xlsx" &&
      request.file.size > request.limits.maxStructuredParseBytes
    ) {
      descriptor = {
        ...descriptor,
        capabilities: ["inspect"],
        warnings: [
          ...descriptor.warnings,
          `XLSX exceeds the ${request.limits.maxStructuredParseBytes} byte parsing limit. Split the workbook or convert the required worksheet to CSV.`,
        ],
      };
    } else if (descriptor.kind === "xlsx") {
      const isCancelled = () => cancelledRequests.has(request.id);
      workbook = await loadXlsxWorkbook(request.file, isCancelled);
      descriptor = inspectXlsxWorkbook(descriptor, workbook);
    } else if (descriptor.capabilities.includes("read")) {
      descriptor = await inspectTextFile(request.file, descriptor);
    }
    if (
      descriptor.kind === "json" &&
      request.file.size > request.limits.maxStructuredParseBytes
    ) {
      descriptor = {
        ...descriptor,
        capabilities: descriptor.capabilities.filter(
          (capability) => capability !== "query",
        ),
        warnings: [
          ...descriptor.warnings,
          `JSON exceeds the ${request.limits.maxStructuredParseBytes} byte structural-query limit. Use text search/chunk reads or convert it to JSONL.`,
        ],
      };
    }
    return { id: request.id, ok: true, type: "registered", descriptor };
  }

  const state = requireState();
  const isCancelled = () => cancelledRequests.has(request.id);
  if (request.type === "inspect") {
    return { id: request.id, ok: true, type: "inspect", descriptor: state.descriptor };
  }
  if (request.type === "search") {
    requireCapability(state.descriptor, "search");
    const result = state.workbook
      ? await searchXlsxFile({
          ...state,
          workbook: state.workbook,
          request: request.request,
          isCancelled,
        })
      : await searchTextFile({ ...state, request: request.request, isCancelled });
    return { id: request.id, ok: true, type: "search", result };
  }
  if (request.type === "read") {
    requireCapability(state.descriptor, "read");
    const result = state.workbook
      ? await readXlsxFileChunk({
          ...state,
          workbook: state.workbook,
          request: request.request,
          isCancelled,
        })
      : await readTextFileChunk({ ...state, request: request.request, isCancelled });
    return { id: request.id, ok: true, type: "read", result };
  }

  requireCapability(state.descriptor, "query");
  const result = await queryTextDataFile({ ...state, request: request.request, isCancelled });
  return { id: request.id, ok: true, type: "query", result };
}

function requireState() {
  if (!file || !descriptor || !limits) throw new Error("File worker has not been registered");
  return { file, descriptor, limits, workbook };
}

function requireCapability(
  current: GenericFileDescriptor,
  capability: "search" | "read" | "query",
) {
  if (!current.capabilities.includes(capability)) {
    throw new Error(
      `${current.name} (${current.kind}) cannot be ${capability === "query" ? "queried" : `${capability}ed`} in this release. Convert it to UTF-8 text, CSV, TSV, JSON, JSONL, or XLSX first.`,
    );
  }
}
