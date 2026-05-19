"use client";

import type {
  AnalysisPlan,
  AnalysisResult,
  CsvProfile,
  CsvProfileOptions,
  CsvWorkerRequest,
  CsvWorkerResponse,
} from "./csv-types";

type PendingRequest = {
  resolve: (value: CsvProfile | AnalysisResult) => void;
  reject: (reason?: unknown) => void;
  onProgress?: (progress: number) => void;
};

type WorkerEntry = {
  worker: Worker;
  pendingRequests: Map<string, PendingRequest>;
};

const workers = new Map<string, WorkerEntry>();

export function profileCsvInWorker(
  workerKey: string,
  file: File,
  options?: CsvProfileOptions,
  onProgress?: (progress: number) => void,
): Promise<CsvProfile> {
  const id = crypto.randomUUID();
  const request: CsvWorkerRequest = { id, type: "profile", file, options };

  return sendWorkerRequest(workerKey, id, request, onProgress) as Promise<CsvProfile>;
}

export function executePlanInWorker(
  workerKey: string,
  plan: AnalysisPlan,
  onProgress?: (progress: number) => void,
): Promise<AnalysisResult> {
  const id = crypto.randomUUID();
  const request: CsvWorkerRequest = { id, type: "executePlan", plan };

  return sendWorkerRequest(workerKey, id, request, onProgress) as Promise<AnalysisResult>;
}

export function resetCsvWorker(workerKey: string) {
  const entry = workers.get(workerKey);
  if (!entry) {
    return;
  }

  for (const pending of entry.pendingRequests.values()) {
    pending.reject(new Error("CSV Worker 已重置。"));
  }
  entry.pendingRequests.clear();
  entry.worker.terminate();
  workers.delete(workerKey);
}

export function resetAllCsvWorkers() {
  for (const workerKey of workers.keys()) {
    resetCsvWorker(workerKey);
  }
}

function sendWorkerRequest(
  workerKey: string,
  id: string,
  request: CsvWorkerRequest,
  onProgress?: (progress: number) => void,
) {
  const entry = getWorkerEntry(workerKey);

  return new Promise<CsvProfile | AnalysisResult>((resolve, reject) => {
    entry.pendingRequests.set(id, { resolve, reject, onProgress });
    entry.worker.postMessage(request);
  });
}

function getWorkerEntry(workerKey: string) {
  const existingEntry = workers.get(workerKey);
  if (existingEntry) {
    return existingEntry;
  }

  const worker = new Worker(new URL("./csv-worker.ts", import.meta.url), {
    type: "module",
  });
  const entry: WorkerEntry = {
    worker,
    pendingRequests: new Map(),
  };
  workers.set(workerKey, entry);

  worker.onmessage = (event: MessageEvent<CsvWorkerResponse>) => {
    const response = event.data;
    const pending = entry.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    if (
      response.type === "profileProgress" ||
      response.type === "executeProgress"
    ) {
      pending.onProgress?.(response.progress);
      return;
    }

    entry.pendingRequests.delete(response.id);

    if (response.type === "profileComplete") {
      pending.resolve(response.profile);
      return;
    }

    if (response.type === "executeComplete") {
      pending.resolve(response.result);
      return;
    }

    pending.reject(new Error(response.error));
  };

  worker.onerror = (event) => {
    for (const pending of entry.pendingRequests.values()) {
      pending.reject(new Error(event.message || "CSV Worker 执行失败。"));
    }
    entry.pendingRequests.clear();
    worker.terminate();
    workers.delete(workerKey);
  };

  return entry;
}
