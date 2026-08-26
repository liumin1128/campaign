import {
  getQuickJS,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten";
import type { JsonValue } from "@earendil-works/pi-ai";

const MAX_CODE_CHARS = 16_000;
const MAX_INPUT_CHARS = 256_000;
const MAX_OUTPUT_CHARS = 64_000;
const MEMORY_LIMIT_BYTES = 32 * 1024 * 1024;
const STACK_LIMIT_BYTES = 512 * 1024;
const EXECUTION_TIMEOUT_MS = 1_500;

export async function executeAnalysisScriptInSandbox(
  code: string,
  input: JsonValue,
): Promise<JsonValue> {
  if (!code.trim() || code.length > MAX_CODE_CHARS) {
    throw new Error(`Script must contain 1-${MAX_CODE_CHARS} characters`);
  }

  const inputJson = JSON.stringify(input);
  if (inputJson.length > MAX_INPUT_CHARS) {
    throw new Error(`Script input exceeds ${MAX_INPUT_CHARS} characters`);
  }

  const QuickJS = await getQuickJS();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT_BYTES);
  runtime.setMaxStackSize(STACK_LIMIT_BYTES);
  runtime.setInterruptHandler(
    shouldInterruptAfterDeadline(Date.now() + EXECUTION_TIMEOUT_MS),
  );
  const context = runtime.newContext();

  try {
    const inputHandle = context.newString(inputJson);
    context.setProp(context.global, "__PI_INPUT_JSON__", inputHandle);
    inputHandle.dispose();

    const evaluation = context.evalCode(`
      "use strict";
      const input = JSON.parse(__PI_INPUT_JSON__);
      const output = (() => {
        ${code}
      })();
      const serialized = JSON.stringify(output === undefined ? null : output);
      if (serialized === undefined) {
        throw new Error("Script output is not JSON serializable");
      }
      serialized;
    `);

    if (evaluation.error) {
      const dumped = context.dump(evaluation.error) as unknown;
      evaluation.error.dispose();
      throw new Error(formatQuickJsError(dumped));
    }

    const serialized = context.dump(evaluation.value) as unknown;
    evaluation.value.dispose();
    if (typeof serialized !== "string") {
      throw new Error("Script did not return a JSON value");
    }
    if (serialized.length > MAX_OUTPUT_CHARS) {
      throw new Error(`Script output exceeds ${MAX_OUTPUT_CHARS} characters`);
    }
    return JSON.parse(serialized) as JsonValue;
  } finally {
    context.dispose();
    runtime.dispose();
  }
}

function formatQuickJsError(value: unknown) {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : "ScriptError";
    const message =
      typeof record.message === "string" ? record.message : JSON.stringify(value);
    return `${name}: ${message}`;
  }
  return String(value);
}
