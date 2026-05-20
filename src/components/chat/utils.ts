import type { FileAttachment } from "./types";
import { SMALL_ATTACHMENT_MAX_BYTES } from "@/lib/client-analysis/csv-types";
import { formatBytes } from "@/lib/client-analysis/csv-analysis-prompts";

/** 简易 CSV 解析：将 CSV 文本解析为格式化 markdown 表格 */
export function parseCSVToMarkdown(raw: string): string {
  const lines = raw.trim().split("\n");
  if (lines.length === 0) return "";

  const rows = lines.map((line) => {
    const fields: string[] = [];
    let current = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });

  if (rows.length === 0) return "";

  const header = rows[0];
  const separator = header.map(() => " --- ");
  const body = rows.slice(1);

  const table = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map(
      (row) => `| ${row.map((f) => f.replace(/\|/g, "\\|")).join(" | ")} |`,
    ),
  ].join("\n");

  return `📄 **CSV 数据：${lines.length} 行 ${header.length} 列**\n\n${table}`;
}

/** 读取文件内容 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
}

/** 处理文件选择，解析为附件列表 */
export async function processFiles(files: FileList): Promise<FileAttachment[]> {
  const attachments: FileAttachment[] = [];

  for (const file of Array.from(files)) {
    const isCSV = file.name.endsWith(".csv") || file.type === "text/csv";
    const isText =
      file.type.startsWith("text/") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".json");

    if (!isCSV && !isText) {
      alert(`不支持的文件类型：${file.name}，已跳过`);
      continue;
    }

    try {
      if (file.size > SMALL_ATTACHMENT_MAX_BYTES) {
        alert(
          `文件过大：${file.name}。附件功能最多支持 ${formatBytes(SMALL_ATTACHMENT_MAX_BYTES)}，CSV 大文件请使用旁边的大 CSV 本地分析按钮添加。`,
        );
        continue;
      }

      const raw = await readFileAsText(file);

      if (isCSV) {
        const markdown = parseCSVToMarkdown(raw);
        attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: markdown,
          type: "csv",
          size: file.size,
        });
      } else {
        attachments.push({
          id: crypto.randomUUID(),
          name: file.name,
          content: raw,
          type: "text",
          size: file.size,
        });
      }
    } catch {
      alert(`文件读取失败：${file.name}，已跳过`);
    }
  }

  return attachments;
}
