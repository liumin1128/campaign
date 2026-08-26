import type { FileResultEnvelope } from "./types";

export function limitResultItems<T>(args: {
  summary: string;
  items: T[];
  maxBytes: number;
  total?: number;
  nextCursor?: string;
  cursorAfterItem?: (item: T) => string;
  warnings?: string[];
}): FileResultEnvelope<T> {
  const warnings = [...(args.warnings ?? [])];
  const limited: T[] = [];

  for (const item of args.items) {
    const candidate = createEnvelope({
      ...args,
      items: [...limited, item],
      warnings,
      truncated: false,
    });
    if (utf8Length(JSON.stringify(candidate)) > args.maxBytes) break;
    limited.push(item);
  }

  const itemsTruncated = limited.length < args.items.length;
  const totalTruncated = args.total !== undefined && args.total > limited.length;
  const truncated = itemsTruncated || totalTruncated || args.nextCursor !== undefined;
  if (itemsTruncated) {
    warnings.push(`Tool result was limited to ${args.maxBytes} bytes.`);
  } else if (totalTruncated && !args.nextCursor) {
    warnings.push(`Only ${limited.length} of ${args.total} items were returned.`);
  }
  const nextCursor =
    itemsTruncated && limited.length > 0 && args.cursorAfterItem
      ? args.cursorAfterItem(limited[limited.length - 1])
      : args.nextCursor;

  return createEnvelope({
    ...args,
    items: limited,
    nextCursor,
    warnings,
    truncated,
  });
}

export function truncateLine(text: string, maxChars: number) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}... [truncated]`;
}

function createEnvelope<T>(args: {
  summary: string;
  items: T[];
  total?: number;
  nextCursor?: string;
  warnings: string[];
  truncated: boolean;
}) {
  return {
    summary: args.summary,
    items: args.items,
    returned: args.items.length,
    ...(args.total === undefined ? {} : { total: args.total }),
    truncated: args.truncated,
    ...(args.nextCursor ? { nextCursor: args.nextCursor } : {}),
    warnings: args.warnings,
  } satisfies FileResultEnvelope<T>;
}

function utf8Length(value: string) {
  return new TextEncoder().encode(value).byteLength;
}
