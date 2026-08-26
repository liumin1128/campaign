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

async function main() {
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
