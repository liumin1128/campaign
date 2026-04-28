export function getRichTextPlainText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasRichTextContent(value: string | null | undefined) {
  return getRichTextPlainText(value).length > 0;
}

export function normalizeRichTextValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  return hasRichTextContent(value) ? value : null;
}
