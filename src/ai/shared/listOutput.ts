export function buildIndexedItems(sourceList: string[]) {
  return sourceList.map((text, index) => `<item i="${index}">${text}</item>`).join("\n");
}

function stripCodeFence(raw: string) {
  const text = raw.trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
}

function normalizeLine(line: string) {
  return line
    .trim()
    .replace(/^\d+[.):]\s*/, "")
    .replace(/^[-*]\s*/, "")
    .trim();
}

export function parseListOutput(content: string, sep: string, expectedLength: number): string[] {
  const normalized = stripCodeFence(content);
  try {
    const parsed: unknown = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      const result = parsed.map(item => String(item ?? "").trim());
      if (result.length === expectedLength) {
        return result;
      }
    }
  } catch {
    // noop
  }

  if (normalized.includes(sep)) {
    return normalized.split(sep).map(part => part.trim());
  }

  const lines = normalized.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  return lines;
}
