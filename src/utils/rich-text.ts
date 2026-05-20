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
  if (typeof value !== "string") {
    return false;
  }

  return getRichTextPlainText(value).length > 0 || /<img\b[^>]*src=/i.test(value);
}

export function normalizeRichTextValue(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  return hasRichTextContent(value) ? value : null;
}
