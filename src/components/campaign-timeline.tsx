"use client";

import { useEffect, useState } from "react";
import { useCampaignTaskStore } from "@/store/campaign-task-store";
import { CampaignTimelineSkeleton } from "@/components/campaign-task-list-skeleton";

type ActionLogRecord = {
  id: number;
  campaign_id: string;
  user_name: string;
  action: string;
  task_id: number | null;
  details: string | null;
  status: string | null;
  created_at: string | null;
};

function formatTime(isoString: string | null): string {
  if (!isoString) return "";

  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getStatusDotColor(status: string | null): string {
  switch (status) {
    case "success":
      return "bg-emerald-400 dark:bg-emerald-500";
    case "error":
      return "bg-red-400 dark:bg-red-500";
    case "info":
      return "bg-sky-400 dark:bg-sky-500";
    default:
      return "bg-slate-300 dark:bg-slate-600";
  }
}

function getStatusDotBorder(status: string | null): string {
  switch (status) {
    case "success":
      return "border-emerald-50 dark:border-emerald-900/40";
    case "error":
      return "border-red-50 dark:border-red-900/40";
    case "info":
      return "border-sky-50 dark:border-sky-900/40";
    default:
      return "border-white dark:border-slate-900";
  }
}

export default function CampaignTimeline({
  campaignID,
}: {
  campaignID: string;
}) {
  const [logs, setLogs] = useState<ActionLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastMutationAt = useCampaignTaskStore((state) => state.lastMutationAt);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/campaign/${encodeURIComponent(campaignID)}/action-logs`,
          { cache: "no-store" },
        );

        const payload = (await response.json()) as {
          ok: boolean;
          error?: string;
          logs?: ActionLogRecord[];
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to load action logs");
        }

        if (!cancelled) {
          setLogs(payload.logs ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load action logs",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchLogs();

    return () => {
      cancelled = true;
    };
  }, [campaignID, lastMutationAt]);

  const isEmpty = !loading && !error && logs.length === 0;

  if (loading) {
    return <CampaignTimelineSkeleton />;
  }

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          操作记录
        </h3>
      </div>

      <div className="px-5 py-4">
        {/* 错误状态 */}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {/* 空状态 */}
        {isEmpty ? (
          <div className="flex flex-col items-center py-8 text-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              className="mb-2 size-8 text-slate-300 dark:text-slate-600"
            >
              <path
                d="M12 8v4l3 3M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Z"
                strokeLinecap="round"
              />
            </svg>
            <p className="text-sm text-slate-400 dark:text-slate-500">
              暂无操作记录
            </p>
          </div>
        ) : null}

        {/* 时间线 */}
        {!error && logs.length > 0 ? (
          <ol className="relative border-s border-slate-200 dark:border-slate-700">
            {logs.map((log) => (
              <li key={log.id} className="mb-6 ms-4 last:mb-0">
                {/* 时间点圆点 */}
                <div
                  className={`absolute mt-1.5 h-3 w-3 rounded-full -start-1.5 border-2 ${getStatusDotColor(log.status)} ${getStatusDotBorder(log.status)}`}
                />

                {/* 时间 */}
                <time className="text-xs font-normal leading-none text-slate-400 dark:text-slate-500">
                  {formatTime(log.created_at)}
                </time>

                {/* 操作者 */}
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  {log.user_name}
                </p>

                {/* 操作描述 */}
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-100">
                  {log.action}
                </p>

                {/* 详情 */}
                {log.details ? (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {log.details}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
