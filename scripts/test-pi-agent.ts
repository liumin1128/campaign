import assert from "node:assert/strict";
import type { AssistantMessageEvent } from "@earendil-works/pi-ai";
import { createPiAgentBudget } from "../src/lib/pi-agent/budget";
import {
  DEFAULT_PI_AGENT_LIMITS,
  normalizePiAgentLimits,
} from "../src/lib/pi-agent/limits";
import { toProxyAssistantEvent } from "../src/lib/pi-agent/proxy-events";
import { executeAnalysisScriptInSandbox } from "../src/lib/pi-agent/script-sandbox";
import { getServerPiAgentLimits } from "../src/lib/pi-agent/server-limits";
import { classifyPiTask } from "../src/lib/pi-agent/task-routing";
import { createLatestFrameNotifier } from "../src/lib/pi-agent/frame-update-notifier";

function testFrameUpdateNotifier() {
  let nextFrameId = 1;
  const callbacks = new Map<number, () => void>();
  const updates: number[] = [];
  const notifier = createLatestFrameNotifier(
    (value: number) => updates.push(value),
    {
      request(callback) {
        const frameId = nextFrameId++;
        callbacks.set(frameId, callback);
        return frameId;
      },
      cancel(frameId) {
        callbacks.delete(frameId);
      },
    },
  );

  for (let value = 0; value < 100; value++) notifier.push(value);
  assert.equal(callbacks.size, 1);
  assert.deepEqual(updates, []);

  const firstFrame = callbacks.entries().next().value;
  assert.ok(firstFrame);
  callbacks.delete(firstFrame[0]);
  firstFrame[1]();
  assert.deepEqual(updates, [99]);

  notifier.push(100);
  notifier.flush();
  assert.equal(callbacks.size, 0);
  assert.deepEqual(updates, [99, 100]);
}

async function main() {
  testFrameUpdateNotifier();
  assert.deepEqual(normalizePiAgentLimits(null), DEFAULT_PI_AGENT_LIMITS);
  assert.deepEqual(
    normalizePiAgentLimits({
      maxModelTurns: 7,
      maxToolCalls: 9,
      maxWebSearches: 2,
    }),
    { maxModelTurns: 7, maxToolCalls: 9, maxWebSearches: 2 },
  );

  process.env.PI_AGENT_MAX_MODEL_TURNS = "8";
  process.env.PI_AGENT_MAX_TOOL_CALLS = "16";
  process.env.PI_AGENT_MAX_WEB_SEARCHES = "3";
  assert.deepEqual(getServerPiAgentLimits(), {
    maxModelTurns: 8,
    maxToolCalls: 16,
    maxWebSearches: 3,
  });
  delete process.env.PI_AGENT_MAX_MODEL_TURNS;
  delete process.env.PI_AGENT_MAX_TOOL_CALLS;
  delete process.env.PI_AGENT_MAX_WEB_SEARCHES;

  assert.deepEqual(
    classifyPiTask(
      "联网搜索2026年10月份，中国—澳新/南亚/非洲方向的热点新闻和事件",
    ),
    { requestsWebSearch: true, referencesFileContext: false },
  );
  assert.deepEqual(
    classifyPiTask("结合前面上传的 CSV 数据，联网搜索相关热点"),
    { requestsWebSearch: true, referencesFileContext: true },
  );
  assert.deepEqual(classifyPiTask("继续分析上述数据"), {
    requestsWebSearch: false,
    referencesFileContext: true,
  });

  const budget = createPiAgentBudget({
    maxModelTurns: 4,
    maxToolCalls: 3,
    maxWebSearches: 1,
  });
  budget.startModelTurn();
  assert.deepEqual(budget.tryUseTool("web_search"), { allowed: true });
  assert.equal(budget.tryUseTool("web_search").allowed, false);
  assert.deepEqual(budget.tryUseTool("query_large_file"), { allowed: true });
  assert.deepEqual(budget.tryUseTool("run_analysis_script"), { allowed: true });
  assert.equal(budget.tryUseTool("query_large_file").allowed, false);
  budget.startModelTurn();
  budget.startModelTurn();
  assert.equal(budget.tryUseTool("query_large_file").allowed, false);
  budget.startModelTurn();
  assert.equal(budget.shouldStopAfterTurn(), true);

  const scriptResult = await executeAnalysisScriptInSandbox(
    "return { sum: input.values.reduce((total, value) => total + value, 0), fetchType: typeof fetch };",
    { values: [2, 3, 5] },
  );
  assert.deepEqual(scriptResult, { sum: 10, fetchType: "undefined" });

  const usage = {
    input: 1,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 3,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  const doneEvent = {
    type: "done",
    reason: "stop",
    message: { usage },
  } as AssistantMessageEvent;
  assert.deepEqual(toProxyAssistantEvent(doneEvent), {
    type: "done",
    reason: "stop",
    usage,
  });

  console.log("Pi agent runtime checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
