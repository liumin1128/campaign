"use client";

import type { JsonValue } from "@earendil-works/pi-ai";
import type { ScriptWorkerRequest, ScriptWorkerResponse } from "./script-types";

export function runAnalysisScript(
  code: string,
  input: JsonValue,
  signal?: AbortSignal,
): Promise<JsonValue> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  const id = crypto.randomUUID();
  const worker = new Worker(new URL("./script-worker.ts", import.meta.url), {
    type: "module",
  });

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };
    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.onmessage = (event: MessageEvent<ScriptWorkerResponse>) => {
      if (event.data.id !== id) return;
      cleanup();
      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Script worker failed"));
    };

    const request: ScriptWorkerRequest = { id, code, input };
    worker.postMessage(request);
  });
}

function createAbortError() {
  return new DOMException("Operation aborted", "AbortError");
}
