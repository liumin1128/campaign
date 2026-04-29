/**
 * 可复用的骨架屏基础组件
 * 使用 Tailwind CSS animate-pulse 实现脉冲动画
 */

type SkeletonProps = {
  className?: string;
};

/** 矩形块骨架 */
export function SkeletonBlock({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

/** 圆形骨架 */
export function SkeletonCircle({ className = "h-7 w-7" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-full bg-slate-200 dark:bg-slate-700 ${className}`}
    />
  );
}

/** 多行文字骨架 */
export function SkeletonText({
  lines = 1,
  className = "",
  lastLineWidth = "w-3/4",
}: {
  lines?: number;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={`space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-3.5 ${i < lines - 1 ? "w-full" : lastLineWidth}`}
        />
      ))}
    </div>
  );
}

/** Task 行骨架 */
export function SkeletonTaskRow() {
  return (
    <div
      aria-hidden="true"
      className="flex animate-pulse items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Checkbox skeleton */}
      <SkeletonBlock className="mt-0.5 h-5 w-5 rounded" />

      <div className="min-w-0 flex-1 space-y-3">
        {/* 标题行 */}
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-4 flex-1" />
          <SkeletonBlock className="h-5 w-20 rounded-full" />
          <SkeletonBlock className="h-5 w-24 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Step 区域骨架（含 header + task rows） */
export function SkeletonStepSection({ taskCount = 2 }: { taskCount?: number }) {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80 dark:bg-transparent dark:ring-slate-800"
    >
      {/* Step Header */}
      <div className="flex animate-pulse items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3.5">
          <SkeletonBlock className="h-4 w-4" />
          <SkeletonCircle className="h-7 w-7" />
          <SkeletonBlock className="h-5 w-48" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-6 w-16 rounded-full" />
          <SkeletonCircle className="h-8 w-8" />
        </div>
      </div>

      {/* Task rows */}
      <div className="space-y-3 bg-slate-50 px-4 py-4 dark:bg-slate-950/30">
        {Array.from({ length: taskCount }).map((_, i) => (
          <SkeletonTaskRow key={i} />
        ))}
      </div>
    </div>
  );
}
