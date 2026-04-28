import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-16 lg:px-8">
      <section className="overflow-hidden rounded-[36px] border border-slate-200/80 bg-white/85 shadow-[0_30px_100px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="grid gap-10 px-8 py-10 lg:grid-cols-[1.3fr_0.9fr] lg:px-12 lg:py-14">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-500">
                Teams Campaign Workspace
              </p>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                  当前项目已切换为 Tailwind 驱动的 Teams 工作台界面。
                </h1>
                <p className="max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                  首页和 Tab 视图都可以直接使用 Tailwind
                  工具类构建界面，不再依赖手写 CSS Module 或 Fluent UI
                  的组件样式层。
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/tab"
                className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                打开 Campaign Workbench
              </Link>
              <Link
                href="/tab/config"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                配置 Teams Tab
              </Link>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-slate-200/80 bg-slate-50/90 px-5 py-5 text-slate-900 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <p className="text-sm text-slate-500">样式方案</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                Tailwind CSS 4
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                通过全局样式入口和 PostCSS 插件接管界面样式编译。
              </p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
              <p className="text-sm text-slate-500">界面层</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                原生 JSX + Utility Classes
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                更适合快速改版、状态驱动和 Teams 内嵌页面的细粒度控制。
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
