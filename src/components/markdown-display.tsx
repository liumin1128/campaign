"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

type MarkdownDisplayProps = {
  content: string;
};

/**
 * 用于展示 AI 返回的 Markdown 内容
 * 支持 GFM 表格、代码块、列表等语法
 */
export default function MarkdownDisplay({ content }: MarkdownDisplayProps) {
  const components: Components = {
    // 代码块（带语言标记）
    code({ className, children }) {
      const isInline = !className;
      const codeText = String(children).replace(/\n$/, "");

      if (isInline) {
        return (
          <code
            className="rounded bg-gray-200/70 px-1.5 py-0.5 text-sm font-medium text-indigo-700 dark:bg-slate-700 dark:text-indigo-300"
          >
            {children}
          </code>
        );
      }

      const match = /language-(\w+)/.exec(className ?? "");
      const language = match ? match[1] : "";

      return (
        <div className="my-3 overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700">
          {language && (
            <div className="bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">
              {language}
            </div>
          )}
          <pre className="overflow-x-auto bg-gray-50 p-3 text-sm dark:bg-slate-900/50">
            <code className={className}>
              {codeText}
            </code>
          </pre>
        </div>
      );
    },
    pre({ children }) {
      return <>{children}</>;
    },

    // 标题
    h1({ children, ...props }) {
      return (
        <h1
          className="mb-2 mt-4 text-xl font-bold text-gray-900 first:mt-0 dark:text-slate-100"
          {...props}
        >
          {children}
        </h1>
      );
    },
    h2({ children, ...props }) {
      return (
        <h2
          className="mb-1.5 mt-3 text-lg font-semibold text-gray-900 first:mt-0 dark:text-slate-100"
          {...props}
        >
          {children}
        </h2>
      );
    },
    h3({ children, ...props }) {
      return (
        <h3
          className="mb-1 mt-3 text-base font-semibold text-gray-900 first:mt-0 dark:text-slate-100"
          {...props}
        >
          {children}
        </h3>
      );
    },

    // 段落
    p({ children, ...props }) {
      return (
        <p
          className="mb-2 leading-relaxed last:mb-0 [&:has(+pre)]:mb-1"
          {...props}
        >
          {children}
        </p>
      );
    },

    // 列表
    ul({ children, ...props }) {
      return (
        <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0" {...props}>
          {children}
        </ul>
      );
    },
    ol({ children, ...props }) {
      return (
        <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0" {...props}>
          {children}
        </ol>
      );
    },
    li({ children, ...props }) {
      return (
        <li className="leading-relaxed" {...props}>
          {children}
        </li>
      );
    },

    // 引用
    blockquote({ children, ...props }) {
      return (
        <blockquote
          className="my-2 border-l-4 border-indigo-300 bg-indigo-50/50 py-1.5 pl-3 pr-2 text-gray-600 dark:border-indigo-600 dark:bg-indigo-950/20 dark:text-slate-300"
          {...props}
        >
          {children}
        </blockquote>
      );
    },

    // 链接
    a({ children, href, ...props }) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 underline underline-offset-2 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          {...props}
        >
          {children}
        </a>
      );
    },

    // 表格
    table({ children, ...props }) {
      return (
        <div className="my-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
          <table
            className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700"
            {...props}
          >
            {children}
          </table>
        </div>
      );
    },
    thead({ children, ...props }) {
      return (
        <thead className="bg-gray-50 dark:bg-slate-800" {...props}>
          {children}
        </thead>
      );
    },
    tbody({ children, ...props }) {
      return (
        <tbody
          className="divide-y divide-gray-200 dark:divide-slate-700"
          {...props}
        >
          {children}
        </tbody>
      );
    },
    tr({ children, ...props }) {
      return <tr {...props}>{children}</tr>;
    },
    th({ children, ...props }) {
      return (
        <th
          className="px-3 py-2 text-left font-medium text-gray-600 dark:text-slate-300"
          {...props}
        >
          {children}
        </th>
      );
    },
    td({ children, ...props }) {
      return (
        <td className="px-3 py-2 text-gray-700 dark:text-slate-300" {...props}>
          {children}
        </td>
      );
    },

    // 水平分割线
    hr({ ...props }) {
      return (
        <hr className="my-4 border-gray-200 dark:border-slate-700" {...props} />
      );
    },

    // 删除线
    del({ children, ...props }) {
      return (
        <del className="text-gray-500 dark:text-slate-400" {...props}>
          {children}
        </del>
      );
    },

    // 任务列表
    input({ ...props }) {
      return (
        <input
          className="mr-1.5 mt-0.5 size-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700"
          type="checkbox"
          {...props}
        />
      );
    },
  };

  return (
    <div className="markdown-display text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
