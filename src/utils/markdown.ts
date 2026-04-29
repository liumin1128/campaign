/**
 * 检测文本是否包含 Markdown 语法
 */
export function isMarkdownContent(text: string): boolean {
  if (!text) return false;

  // 常见 Markdown 语法模式
  const markdownPatterns = [
    // 标题: # ~ ######
    /^#{1,6}\s/m,
    // 粗体/斜体: **text** or __text__ or *text* or _text_
    /(\*\*(?:(?!\*\*).)+\*\*|__(?:(?!__).)+__)/,
    // 行内代码: `code`
    /`[^`]+`/,
    // 代码块: ``` ... ``` 或 缩进代码块
    /```[\s\S]*?```/,
    // 链接: [text](url)
    /\[.+?\]\(.+?\)/,
    // 图片: ![alt](url)
    /!\[.*?\]\(.+?\)/,
    // 无序列表: -, *, +
    /^[\s]*[-*+]\s/m,
    // 有序列表: 1.
    /^[\s]*\d+\.\s/m,
    // 引用块: >
    /^>[\s>]/m,
    // 水平分割线: ---, ***, ___
    /^[-*_]{3,}\s*$/m,
    // 表格: | col1 | col2 |
    /^\|.+\|.+\|/m,
    // 任务列表: - [ ] or - [x]
    /^\s*[-*+]\s\[[ x]\]/im,
    // 删除线: ~~text~~
    /~~[^~]+~~/,
  ];

  return markdownPatterns.some((pattern) => pattern.test(text));
}
