import type { CsvProfile, CsvRow, CsvWorkerRequest, CsvWorkerResponse } from "./csv-types";
import { executeAnalysisPlan, executeDataQuery } from "./csv-plan-executor";
import { profileCsvFile } from "./csv-profiler";

type WorkerState = {
  fileName?: string;
  headers: string[];
  rows: CsvRow[];
  profile?: CsvProfile;
};

const state: WorkerState = {
  headers: [],
  rows: [],
};

function post(response: CsvWorkerResponse) {
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<CsvWorkerRequest>) => {
  const request = event.data;

  try {
    if (request.type === "profile") {
      post({ id: request.id, type: "profileProgress", progress: 0.05 });
      const { profile, rows, headers } = await profileCsvFile(
        request.file,
        request.options,
      );
      state.fileName = request.file.name;
      state.headers = headers;
      state.rows = rows;
      state.profile = profile;
      post({ id: request.id, type: "profileProgress", progress: 1 });
      post({ id: request.id, type: "profileComplete", profile });
      return;
    }

    if (request.type === "executePlan") {
      if (!state.profile) {
        throw new Error("请先选择并解析 CSV 文件。");
      }

      post({ id: request.id, type: "executeProgress", progress: 0.2 });
      const result = executeAnalysisPlan(
        state.rows,
        request.plan,
        state.profile.dataQuality,
      );
      post({ id: request.id, type: "executeProgress", progress: 1 });
      post({ id: request.id, type: "executeComplete", result });
      return;
    }

    if (request.type === "executeQuery") {
      if (!state.profile) {
        throw new Error("请先选择并解析 CSV 文件。");
      }

      const result = executeDataQuery(
        state.rows,
        request.query,
        state.profile.dataQuality,
      );
      post({ id: request.id, type: "queryComplete", result });
    }
  } catch (error) {
    post({
      id: request.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
