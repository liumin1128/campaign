"use client";

import { useState, useCallback } from "react";
import { FileCopy, Check } from "flowbite-react-icons/outline";

/** 将 markdown 文本转换为简易 HTML（用于富文本粘贴） */
function mdToHtml(md: string): string {
  const html = md
    // 代码块 ```lang\n...```
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const langLabel = lang
        ? `<div style="font-size:0.8em;color:#888;">${lang}</div>`
        : "";
      return `${langLabel}<pre style="background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto;font-family:monospace;white-space:pre-wrap;">${escapeHtml(code.trim())}</pre>`;
    })
    // 行内代码
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-family:monospace;">$1</code>',
    )
    // 粗体 **text**
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // 斜体 *text*
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // 链接 [text](url)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // 换行
    .replace(/\n/g, "<br>");

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;">${html}</div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface CopyButtonProps {
  content: string;
  className?: string;
}

export function CopyButton({ content, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!content) return;

    try {
      // 同时写入纯文本（markdown）和富文本（html）
      const htmlContent = mdToHtml(content);
      const blob = new Blob([htmlContent], { type: "text/html" });
      const clipboardItem = new ClipboardItem({
        "text/plain": new Blob([content], { type: "text/plain" }),
        "text/html": blob,
      });

      await navigator.clipboard.write([clipboardItem]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 降级：只复制纯文本
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // 忽略
      }
    }
  }, [content]);

  if (!content) return null;

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center justify-center rounded-md p-1 text-xs transition ${
        copied
          ? "text-emerald-500"
          : "text-gray-400 opacity-0 group-hover:opacity-100 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      } ${className}`}
      title={copied ? "已复制" : "复制内容"}
    >
      {copied ? (
        <Check className="size-3.5" />
      ) : (
        <FileCopy className="size-3.5" />
      )}
    </button>
  );
}
