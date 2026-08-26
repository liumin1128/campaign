"use client";

import { DEFAULT_FILE_AGENT_LIMITS } from "./limits";
import type {
  FileAgentLimits,
  FileQueryRequest,
  FileQueryResult,
  FileReadRequest,
  FileReadResult,
  FileResultEnvelope,
  FileSearchMatch,
  FileSearchRequest,
  FileWorkerRequest,
  FileWorkerResponse,
  GenericFileDescriptor,
} from "./types";

type WorkerResult =
  | GenericFileDescriptor
  | FileResultEnvelope<FileSearchMatch>
  | FileReadResult
  | FileQueryResult;

type PendingRequest = {
  resolve: (value: WorkerResult) => void;
  reject: (reason?: unknown) => void;
  cleanup?: () => void;
};

type FileWorkerEntry = {
  worker: Worker;
  descriptor?: GenericFileDescriptor;
  pending: Map<string, PendingRequest>;
};

const entries = new Map<string, FileWorkerEntry>();

export async function registerGenericFile(
  file: File,
  limits: FileAgentLimits = DEFAULT_FILE_AGENT_LIMITS,
): Promise<GenericFileDescriptor> {
  const fileId = crypto.randomUUID();
  const worker = new Worker(new URL("./file-worker.ts", import.meta.url), {
    type: "module",
  });
  const entry: FileWorkerEntry = { worker, pending: new Map() };
  entries.set(fileId, entry);
  attachWorkerListeners(fileId, entry);

  try {
    const descriptor = (await send(fileId, {
      id: crypto.randomUUID(),
      type: "register",
      fileId,
      file,
      limits,
    })) as GenericFileDescriptor;
    entry.descriptor = descriptor;
    return descriptor;
  } catch (error) {
    resetGenericFile(fileId);
    throw error;
  }
}

export async function inspectGenericFile(
  fileId: string,
  signal?: AbortSignal,
): Promise<GenericFileDescriptor> {
  const descriptor = (await send(
    fileId,
    { id: crypto.randomUUID(), type: "inspect" },
    signal,
  )) as GenericFileDescriptor;
  getEntry(fileId).descriptor = descriptor;
  return descriptor;
}

export function searchGenericFile(
  fileId: string,
  request: FileSearchRequest,
  signal?: AbortSignal,
) {
  return send(
    fileId,
    { id: crypto.randomUUID(), type: "search", request },
    signal,
  ) as Promise<FileResultEnvelope<FileSearchMatch>>;
}

export function readGenericFile(
  fileId: string,
  request: FileReadRequest,
  signal?: AbortSignal,
) {
  return send(
    fileId,
    { id: crypto.randomUUID(), type: "read", request },
    signal,
  ) as Promise<FileReadResult>;
}

export function queryGenericFile(
  fileId: string,
  request: FileQueryRequest,
  signal?: AbortSignal,
) {
  return send(
    fileId,
    { id: crypto.randomUUID(), type: "query", request },
    signal,
  ) as Promise<FileQueryResult>;
}

export function resetGenericFile(fileId: string) {
  const entry = entries.get(fileId);
  if (!entry) return;
  for (const pending of entry.pending.values()) {
    pending.cleanup?.();
    pending.reject(new Error("File worker was released"));
  }
  entry.pending.clear();
  entry.worker.terminate();
  entries.delete(fileId);
}

export function resetAllGenericFiles() {
  for (const fileId of [...entries.keys()]) resetGenericFile(fileId);
}

export function getGenericFileDescriptor(fileId: string) {
  return entries.get(fileId)?.descriptor;
}

function send(fileId: string, request: FileWorkerRequest, signal?: AbortSignal): Promise<WorkerResult> {
  const entry = getEntry(fileId);
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      entry.pending.delete(request.id);
      entry.worker.postMessage({ id: crypto.randomUUID(), type: "cancel", targetId: request.id } satisfies FileWorkerRequest);
      reject(createAbortError());
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
    entry.pending.set(request.id, {
      resolve,
      reject,
      cleanup: () => signal?.removeEventListener("abort", handleAbort),
    });
    entry.worker.postMessage(request);
  });
}

function attachWorkerListeners(fileId: string, entry: FileWorkerEntry) {
  entry.worker.onmessage = (event: MessageEvent<FileWorkerResponse>) => {
    const response = event.data;
    const pending = entry.pending.get(response.id);
    if (!pending) return;
    entry.pending.delete(response.id);
    pending.cleanup?.();

    if (!response.ok) {
      pending.reject(new Error(response.error));
    } else if ("descriptor" in response) {
      pending.resolve(response.descriptor);
    } else {
      pending.resolve(response.result);
    }
  };

  entry.worker.onerror = (event) => {
    for (const pending of entry.pending.values()) {
      pending.cleanup?.();
      pending.reject(new Error(event.message || "File worker failed"));
    }
    entry.pending.clear();
    entry.worker.terminate();
    entries.delete(fileId);
  };
}

function getEntry(fileId: string) {
  const entry = entries.get(fileId);
  if (!entry) throw new Error(`File is no longer available in this browser session: ${fileId}`);
  return entry;
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}
