import { executeAnalysisScriptInSandbox } from "./script-sandbox";
import type { ScriptWorkerRequest, ScriptWorkerResponse } from "./script-types";

self.onmessage = async (event: MessageEvent<ScriptWorkerRequest>) => {
  const request = event.data;
  let response: ScriptWorkerResponse;

  try {
    response = {
      id: request.id,
      ok: true,
      result: await executeAnalysisScriptInSandbox(request.code, request.input),
    };
  } catch (error) {
    response = {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  self.postMessage(response);
};
