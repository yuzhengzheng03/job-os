export function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCompanyName(value: string): string {
  return normalizeText(value)
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\b(co\.?|ltd\.?|inc\.?)\b/g, "")
    .trim();
}

export function normalizeTitle(value: string): string {
  return normalizeText(value).replace(/[【】[\]()]/g, " ").replace(/\s+/g, " ").trim();
}

export function inferTitle(rawText: string): string {
  const firstUsefulLine = rawText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line.length <= 80);

  return firstUsefulLine ?? "未命名岗位机会";
}
