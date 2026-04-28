"use client";

import Link from "next/link";
import { useState } from "react";
import { useTeams, extractUserInfo } from "@/lib/useTeams";

type SendMode = "bot" | "webhook";

interface Task {
  id: number;
  title: string;
  done: boolean;
}

interface Stage {
  id: number;
  name: string;
  title: string;
  summary: string;
  dueDate: string;
  assignee: string;
  status: "completed" | "current" | "pending";
}

const stages: Stage[] = [
  {
    id: 1,
    name: "Initial Idea",
    title: "Step 1: Initial Planning",
    summary: "Define objectives, research market, prepare budget proposal",
    dueDate: "2026-03-15",
    assignee: "DS",
    status: "completed",
  },
  {
    id: 2,
    name: "Proposal Justification",
    title: "Step 2: Proposal Justification",
    summary: "Present to leadership and get sign-off on budget and timeline",
    dueDate: "2026-03-28",
    assignee: "DS",
    status: "completed",
  },
  {
    id: 3,
    name: "Approval",
    title: "Step 3: Approval",
    summary: "GM raised queries on proposal, and requires data support",
    dueDate: "2026-04-30",
    assignee: "GM + DS",
    status: "current",
  },
  {
    id: 4,
    name: "Execution",
    title: "Step 4: Campaign Launch Prep",
    summary: "Set up tracking, configure platforms, schedule content",
    dueDate: "2026-05-10",
    assignee: "WMP",
    status: "pending",
  },
  {
    id: 5,
    name: "Go Live & Monitor",
    title: "Step 5: Go Live & Monitor",
    summary: "Launch campaign and monitor performance metrics",
    dueDate: "2026-05-20",
    assignee: "WMP + BMD",
    status: "pending",
  },
];

const initialTasks: Task[] = [
  { id: 1, title: "完成 Teams 插件开发", done: false },
  { id: 2, title: "编写接口文档", done: false },
  { id: 3, title: "代码评审", done: true },
];

const panelClassName =
  "rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur";

const sectionCardClassName =
  "rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.06)]";

const fieldClassName =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-200/70";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getStatusLabel(status: Stage["status"]) {
  if (status === "completed") {
    return "Completed";
  }

  if (status === "current") {
    return "In Progress";
  }

  return "Pending";
}

function getStatusPillClasses(status: Stage["status"]) {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (status === "current") {
    return "bg-indigo-100 text-indigo-700";
  }

  return "bg-amber-100 text-amber-700";
}

function getStepDotClasses(status: Stage["status"]) {
  if (status === "completed") {
    return "border-emerald-600 bg-emerald-600 text-white";
  }

  if (status === "current") {
    return "border-indigo-600 bg-indigo-600 text-white";
  }

  return "border-slate-200 bg-white text-slate-500";
}

function getStageProgressWidth(stage: Stage, taskCount: number) {
  if (stage.status === "completed") {
    return "100%";
  }

  if (stage.status === "current") {
    return "48%";
  }

  if (stage.id === 4) {
    return taskCount > 0 ? "12%" : "0%";
  }

  return "0%";
}

export default function TabPage() {
  const { inTeams, context } = useTeams();
  const info = extractUserInfo(context);
  const [activeStage, setActiveStage] = useState(4);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [newTask, setNewTask] = useState("");
  const [message, setMessage] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    return localStorage.getItem("teams_webhook_url") ?? "";
  });
  const [sendMode, setSendMode] = useState<SendMode>("bot");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const userName =
    context?.user?.displayName ?? (inTeams ? "Teams 用户" : "开发者");
  const completedTaskCount = tasks.filter((task) => task.done).length;
  const progressPercent = Math.round((3 / stages.length) * 100);
  const canSend = message.trim() && (sendMode === "bot" || webhookUrl.trim());

  const addTask = () => {
    if (!newTask.trim()) {
      return;
    }

    setTasks((prev) => [
      ...prev,
      { id: Date.now(), title: newTask.trim(), done: false },
    ]);
    setNewTask("");
  };

  const toggleTask = (id: number) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id ? { ...task, done: !task.done } : task,
      ),
    );
  };

  const sendMessage = async () => {
    if (!message.trim()) {
      return;
    }

    if (sendMode === "webhook" && !webhookUrl.trim()) {
      return;
    }

    setSending(true);
    setStatus(null);

    if (sendMode === "webhook") {
      localStorage.setItem("teams_webhook_url", webhookUrl.trim());
    }

    try {
      const body: Record<string, string> = { message: message.trim() };

      if (sendMode === "webhook") {
        body.webhookUrl = webhookUrl.trim();
        body.sender = userName;
      }

      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (response.ok) {
        setStatus(`✅ ${data.message}`);
        setMessage("");
      } else {
        setStatus(`❌ 发送失败: ${data.error}`);
      }
    } catch {
      setStatus("❌ 网络错误，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_50%,#f8fafc_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-350 flex-col gap-6 px-4 py-5 md:px-6 lg:py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
        >
          ← Back to Flow List
        </Link>

        <section className={cn(panelClassName, "p-6 lg:p-8")}>
          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-wrap items-start gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-linear-to-br from-indigo-100 to-violet-100 text-lg font-bold text-indigo-600">
                  1
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
                    Campaign Overview
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    2026 summer campaign
                  </h1>
                  <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                    欢迎回来，{userName}。当前页面已切换为 workbench 视图，保留任务、群发消息和 Teams 环境信息功能。
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Go to the Workbench for this Campaign
              </button>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="relative pb-4">
                <div className="absolute top-4.25 right-6.5 left-6.5 hidden h-0.5 bg-slate-200 md:block" />
                <div
                  className="absolute top-4 left-6.5 hidden h-1 rounded-full bg-linear-to-r from-emerald-500 to-indigo-500 md:block"
                  style={{ width: `calc(${progressPercent}% - 26px)` }}
                />

                <div className="grid grid-cols-2 gap-4 md:grid-cols-5 md:gap-2">
                  {stages.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setActiveStage(stage.id)}
                      className="flex flex-col items-start gap-2 text-left"
                    >
                      <div
                        className={cn(
                          "grid h-9 w-9 place-items-center rounded-full border text-sm font-bold transition",
                          getStepDotClasses(stage.status),
                        )}
                      >
                        {stage.status === "completed" ? "✓" : stage.id}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {stage.name}
                        </div>
                        <div className="text-xs capitalize text-slate-500">
                          {stage.status}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-28 text-left xl:text-right">
                <div className="text-4xl font-semibold tracking-tight text-indigo-600">
                  {progressPercent}%
                </div>
                <div className="mt-1 text-sm text-slate-500">Complete</div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.92fr)]">
          <div className="flex flex-col gap-4">
            {stages.map((stage) => {
              const isActive = activeStage === stage.id;

              return (
                <article
                  key={stage.id}
                  className={cn(
                    sectionCardClassName,
                    isActive &&
                      "border-indigo-400 shadow-[0_18px_40px_rgba(99,102,241,0.14)]",
                  )}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <button
                        type="button"
                        onClick={() => setActiveStage(stage.id)}
                        className="flex flex-1 items-start gap-4 text-left"
                      >
                        <div
                          className={cn(
                            "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                            stage.status === "completed" &&
                              "bg-emerald-600 text-white",
                            stage.status === "current" &&
                              "bg-indigo-600 text-white",
                            stage.status === "pending" &&
                              "bg-slate-100 text-slate-600",
                          )}
                        >
                          {stage.status === "completed" ? "✓" : stage.id}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h2 className="text-xl font-semibold text-slate-950">
                            {stage.title}
                          </h2>
                          <p className="mt-1 text-sm leading-7 text-slate-600">
                            {stage.summary}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                            <span>• {stage.assignee}</span>
                            <span>• Due: {stage.dueDate}</span>
                            <span>
                              • {stage.id === 4 ? `${tasks.length} tasks` : `${stage.id + 2} tasks`}
                            </span>
                          </div>
                        </div>
                      </button>

                      <span
                        className={cn(
                          "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                          getStatusPillClasses(stage.status),
                        )}
                      >
                        {getStatusLabel(stage.status)}
                      </span>
                    </div>

                    <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-indigo-500 to-violet-500"
                        style={{ width: getStageProgressWidth(stage, tasks.length) }}
                      />
                    </div>

                    {isActive && stage.id === 4 ? (
                      <>
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            className={cn(fieldClassName, "flex-1")}
                            placeholder="Add task for this step..."
                            value={newTask}
                            onChange={(event) => setNewTask(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                addTask();
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={addTask}
                            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                          >
                            + Add Task
                          </button>
                        </div>

                        <div className="flex flex-col gap-3">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                            >
                              <button
                                type="button"
                                onClick={() => toggleTask(task.id)}
                                aria-label={task.done ? "标记为未完成" : "标记为完成"}
                                className={cn(
                                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-xs font-bold transition",
                                  task.done
                                    ? "border-indigo-600 bg-indigo-600 text-white"
                                    : "border-slate-300 bg-white text-transparent hover:border-slate-400",
                                )}
                              >
                                ✓
                              </button>

                              <div className="min-w-0 flex-1">
                                <div
                                  className={cn(
                                    "text-sm font-medium text-slate-900",
                                    task.done && "text-slate-400 line-through",
                                  )}
                                >
                                  {task.title}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                  Due: 2026-04-20
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="flex flex-col gap-4">
            <section className={sectionCardClassName}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-500">Budget</p>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
                    ¥50k
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Details Page
                </button>
              </div>
            </section>

            <section className={sectionCardClassName}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Statistics
              </h2>
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-200 pb-3 text-sm">
                  <span className="text-slate-600">Total Steps</span>
                  <span className="font-semibold text-slate-950">{stages.length}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-200 pb-3 text-sm">
                  <span className="text-slate-600">Completed Steps</span>
                  <span className="font-semibold text-emerald-600">2</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-200 pb-3 text-sm">
                  <span className="text-slate-600">Total Tasks</span>
                  <span className="font-semibold text-slate-950">{tasks.length}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                  <span className="text-slate-600">Completed Tasks</span>
                  <span className="font-semibold text-emerald-600">
                    {completedTaskCount}
                  </span>
                </div>
              </div>
            </section>

            <section className={sectionCardClassName}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Flow Information
              </h2>
              <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Owner</dt>
                <dd className="text-slate-950">{userName || "Unknown"}</dd>
                <dt className="text-slate-500">Start Date</dt>
                <dd className="text-slate-950">2026-04-01</dd>
                <dt className="text-slate-500">Expected Due</dt>
                <dd className="text-slate-950">2026-05-15</dd>
                <dt className="text-slate-500">App Host</dt>
                <dd className="text-slate-950">{info.appHost || "Browser"}</dd>
                <dt className="text-slate-500">Team</dt>
                <dd className="text-slate-950">{info.teamName || "未进入具体 Team"}</dd>
              </dl>
            </section>

            <section className={sectionCardClassName}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Recent Activity
              </h2>
              <div className="mt-4 space-y-4">
                <div className="flex gap-3">
                  <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.14)]" />
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      Task completed
                    </div>
                    <div className="mt-1 text-sm leading-7 text-slate-600">
                      {completedTaskCount > 0
                        ? "团队已完成一部分当前执行任务"
                        : "当前还没有完成的任务记录"}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="mt-1 h-3 w-3 shrink-0 rounded-full bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.14)]" />
                  <div>
                    <div className="text-sm font-semibold text-slate-950">
                      Team member assigned
                    </div>
                    <div className="mt-1 text-sm leading-7 text-slate-600">
                      DS assigned as owner, 当前用户 {userName}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={sectionCardClassName}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Message Center
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSendMode("bot")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    sendMode === "bot"
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  Bot 主动消息
                </button>
                <button
                  type="button"
                  onClick={() => setSendMode("webhook")}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold transition",
                    sendMode === "webhook"
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  Incoming Webhook
                </button>
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-500">
                {sendMode === "bot"
                  ? "通过 Bot Framework 发送，需要先在群组中 @Bot 建立会话。"
                  : "通过 Incoming Webhook 发送到频道，会自动记住上次填写的 URL。"}
              </p>

              <div className="mt-4 flex flex-col gap-3">
                {sendMode === "webhook" ? (
                  <input
                    className={fieldClassName}
                    placeholder="粘贴 Incoming Webhook URL..."
                    value={webhookUrl}
                    onChange={(event) => setWebhookUrl(event.target.value)}
                    type="url"
                  />
                ) : null}

                <textarea
                  className={cn(fieldClassName, "min-h-32 resize-y")}
                  placeholder="输入要发送给群组的消息..."
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={4}
                />

                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={sending || !canSend}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {sending ? "发送中..." : "发送到群组"}
                </button>

                {status ? (
                  <p
                    className={cn(
                      "text-sm font-medium",
                      status.startsWith("✅") ? "text-emerald-700" : "text-rose-600",
                    )}
                  >
                    {status}
                  </p>
                ) : null}
              </div>
            </section>

            <section className={sectionCardClassName}>
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Environment Snapshot
              </h2>
              <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-slate-500">Teams 环境</dt>
                <dd className="text-slate-950">{inTeams ? "是" : "否（浏览器模式）"}</dd>
                <dt className="text-slate-500">用户名</dt>
                <dd className="text-slate-950">{info.displayName || userName}</dd>
                <dt className="text-slate-500">Tenant ID</dt>
                <dd className="break-all text-slate-950">{info.tenantId || "—"}</dd>
                <dt className="text-slate-500">Channel</dt>
                <dd className="text-slate-950">{info.channelName || "—"}</dd>
                <dt className="text-slate-500">Theme</dt>
                <dd className="text-slate-950">{info.theme || "default"}</dd>
              </dl>

              <button
                type="button"
                onClick={() => setShowRaw((prev) => !prev)}
                className="mt-5 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {showRaw ? "收起" : "展开"} JSON
              </button>

              {showRaw ? (
                <pre className="mt-4 max-h-80 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                  {JSON.stringify(context, null, 2)}
                </pre>
              ) : null}
            </section>
          </div>
        </section>
      </div>
    </div>
  );
}