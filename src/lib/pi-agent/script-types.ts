import type { JsonValue } from "@earendil-works/pi-ai";

export interface ScriptWorkerRequest {
  id: string;
  code: string;
  input: JsonValue;
}

export type ScriptWorkerResponse =
  | { id: string; ok: true; result: JsonValue }
  | { id: string; ok: false; error: string };
