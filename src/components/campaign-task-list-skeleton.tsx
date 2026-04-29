"use client";

import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonTaskRow,
} from "@/components/ui/skeleton";

/**
 * Campaign 任务列表的骨架屏
 * 在任务数据加载过程中显示，匹配真实 UI 的结构
 */
export default function CampaignTaskListSkeleton() {
  const stepHeaders = [
    "Step 1: Initial Idea",
    "Step 2: Proposal Justification",
    "Step 3: Approval",
    "Step 4: Execution",
    "Step 5: Go Live & Monitor",
  ];

  return (
    <div className="flex flex-col gap-4" aria-label="Loading tasks">
      {/* Skeleton step sections */}
      {stepHeaders.map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-transparent dark:ring-slate-800"
        >
          {/* Step Header skeleton */}
          <div className="flex animate-pulse items-center justify-between gap-3 px-4 py-4">
            <div className="flex items-center gap-3.5">
              <SkeletonBlock className="h-4 w-4" />
              <SkeletonCircle className="h-7 w-7" />
              <SkeletonBlock className="h-5 w-52" />
            </div>
            <div className="flex items-center gap-2">
              <SkeletonBlock className="h-6 w-16 rounded-full" />
              <SkeletonCircle className="h-8 w-8" />
            </div>
          </div>

          {/* Task rows skeleton - only first 3 steps show detail */}
          {index < 3 && (
            <div className="space-y-3 bg-slate-50 px-4 py-4 dark:bg-slate-950/30 rounded-xl">
              {Array.from({ length: index === 0 ? 3 : 2 }).map((_, i) => (
                <SkeletonTaskRow key={i} />
              ))}
            </div>
          )}
        </div>
      ))}

      {/* 加载提示 - 屏幕阅读器用 */}
      <span className="sr-only" role="status">
        Loading tasks...
      </span>
    </div>
  );
}

/**
 * Campaign 操作记录骨架屏
 * 匹配时间线实际 UI 的结构
 */
export function CampaignTimelineSkeleton() {
  const timelineItems = [
    { hasDetails: true },
    { hasDetails: false },
    { hasDetails: true },
  ];

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800"
    >
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <SkeletonBlock className="h-5 w-20" />
      </div>

      <div className="px-5 py-4">
        <ol className="relative animate-pulse border-s border-slate-200 dark:border-slate-700">
          {timelineItems.map((item, index) => (
            <li key={index} className="mb-6 ms-4 last:mb-0">
              {/* 时间点圆点 */}
              <SkeletonCircle className="absolute mt-1.5 h-3 w-3 -start-1.5" />

              {/* 时间 */}
              <SkeletonBlock className="h-3 w-24" />

              {/* 操作者 */}
              <SkeletonBlock className="mt-1.5 h-3 w-16" />

              {/* 操作描述 */}
              <SkeletonBlock className="mt-2 h-3.5 w-40" />

              {/* 详情 */}
              {item.hasDetails ? (
                <div className="mt-2 space-y-1.5">
                  <SkeletonBlock className="h-3 w-full" />
                  <SkeletonBlock className="h-3 w-3/4" />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Campaign 头部骨架屏
 */
export function CampaignHeaderSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800"
    >
      <div className="px-4 py-5 sm:p-6">
        <div className="animate-pulse space-y-3">
          {/* 面包屑骨架 */}
          <div className="flex items-center gap-2">
            <SkeletonBlock className="h-3.5 w-16" />
            <SkeletonBlock className="h-3.5 w-4" />
            <SkeletonBlock className="h-3.5 w-24" />
          </div>

          {/* 标题骨架 */}
          <SkeletonBlock className="h-6 w-64" />

          {/* 描述骨架 */}
          <SkeletonBlock className="h-4 w-48" />

          {/* 进度条骨架 */}
          <div className="flex items-center gap-4 pt-2">
            <SkeletonBlock className="h-3 w-full max-w-xs rounded-full" />
            <SkeletonBlock className="h-4 w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}
