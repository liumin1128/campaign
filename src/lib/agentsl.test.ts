/**
 * AgentSL Runner 连接性测试脚本
 *
 * 运行: npx tsx src/lib/agentsl.test.ts
 */

import {
  healthCheck,
  createJob,
  getJob,
  isJobTerminal,
  pollJobUntilComplete,
} from "@/lib/agentsl";
import { getAgentSLApiToken, getAgentSLUserId, getAgentSLId } from "@/lib/env";

async function testHealthCheck() {
  console.log("🔍 测试 1: 健康检查 (GET /health_check)...");
  try {
    const result = await healthCheck();
    console.log("  ✅ 健康检查通过:", JSON.stringify(result));
    return true;
  } catch (err) {
    console.error("  ❌ 健康检查失败:", err);
    return false;
  }
}

async function testCreateJob() {
  console.log("\n🔍 测试 2: 创建 Job (POST /run/)...");
  try {
    const userId = getAgentSLUserId();
    const agentId = getAgentSLId();

    const job = await createJob({
      user_id: userId,
      session_id: `test-${Date.now()}`,
      agent_id: agentId,
      message: {
        role: "user",
        parts: [{ text: "Hello! Please introduce yourself briefly." }],
      },
    });

    console.log("  ✅ Job 创建成功:");
    console.log(`     job_id:      ${job.job_id}`);
    console.log(`     job_status:  ${job.job_status}`);
    console.log(`     user_id:     ${job.user_id}`);
    console.log(`     agent_id:    ${job.agent_id}`);
    return job.job_id;
  } catch (err) {
    console.error("  ❌ 创建 Job 失败:", err);
    return null;
  }
}

async function testPollJob(jobId: string) {
  console.log("\n🔍 测试 3: 轮询 Job 直到完成...");
  try {
    let lastStatus = "";
    const job = await pollJobUntilComplete(jobId, {
      intervalMs: 3000,
      timeoutMs: 120_000, // 2 分钟
      onProgress: (j) => {
        if (j.job_status !== lastStatus) {
          lastStatus = j.job_status;
          console.log(`  ⏳ 状态变更: ${j.job_status}`);
        }
      },
    });

    console.log(`  ✅ Job 完成 (status: ${job.job_status})`);
    if (job.job_results?.response) {
      console.log(`  📝 响应: ${job.job_results.response.slice(0, 200)}...`);
    }
    if (job.job_results?.execution_time_seconds) {
      console.log(`  ⏱️  执行耗时: ${job.job_results.execution_time_seconds}s`);
    }
    if (job.job_results?.error_message) {
      console.log(`  ⚠️  错误信息: ${job.job_results.error_message}`);
    }
    return true;
  } catch (err) {
    console.error("  ❌ 轮询失败:", err);
    return false;
  }
}

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║  AgentSL Runner 连接性测试       ║");
  console.log("╚══════════════════════════════════╝\n");

  console.log("📋 配置信息:");
  console.log(`   Token:  ${getAgentSLApiToken().slice(0, 8)}...`);
  console.log(`   User:   ${getAgentSLUserId()}`);
  console.log(`   Agent:  ${getAgentSLId()}`);
  console.log("");

  // 测试 1: 健康检查
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log("\n❌ 健康检查失败，终止测试。");
    process.exit(1);
  }

  // 测试 2: 创建 Job
  const jobId = await testCreateJob();
  if (!jobId) {
    console.log("\n❌ 创建 Job 失败，终止测试。");
    process.exit(1);
  }

  // 测试 3: 轮询 Job 完成
  await testPollJob(jobId);

  // 测试 4: 查询 Job 最终状态
  console.log("\n🔍 测试 4: 查询最终 Job 状态 (GET /run/{job_id})...");
  try {
    const final = await getJob(jobId);
    console.log(`  ✅ status: ${final.job_status}`);
    console.log(
      `  📝 结果: ${final.job_results?.response ? "有响应" : "无响应"}`,
    );
  } catch (err) {
    console.error("  ❌ 查询失败:", err);
  }

  console.log("\n╔══════════════════════════════════╗");
  console.log("║  测试完成                         ║");
  console.log("╚══════════════════════════════════╝");
}

main().catch(console.error);
