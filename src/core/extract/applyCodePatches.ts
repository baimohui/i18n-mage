import fs from "fs";
import { FixedTEntry } from "@/types";
import { toAbsolutePath } from "@/utils/fs";

function parseRange(pos: string) {
  const parts = pos
    .split(",")
    .map(item => Number(item.trim()))
    .filter(item => Number.isFinite(item));

  if (parts.length >= 4) {
    return { start: parts[2], end: parts[3] };
  }
  if (parts.length >= 2) {
    return { start: parts[0], end: parts[1] };
  }
  return null;
}

export async function applyCodePatches(patchedEntryIdInfo: Record<string, FixedTEntry[]>, options: { importStatement?: string } = {}) {
  const importStatement = options.importStatement?.trim() ?? "";
  for (const [filePath, patchList] of Object.entries(patchedEntryIdInfo)) {
    if (patchList.length === 0) continue;
    const absolutePath = toAbsolutePath(filePath);
    const original = await fs.promises.readFile(absolutePath, "utf8");
    const sorted = [...patchList].sort((a, b) => {
      const aRange = parseRange(a.pos);
      const bRange = parseRange(b.pos);
      const aStart = aRange?.start ?? -1;
      const bStart = bRange?.start ?? -1;
      return bStart - aStart;
    });

    let output = original;
    for (const patch of sorted) {
      const range = parseRange(patch.pos);
      if (!range) continue;
      if (range.start < 0 || range.end < range.start || range.end > output.length) continue;
      output = `${output.slice(0, range.start)}${patch.fixedRaw}${output.slice(range.end)}`;
    }

    if (output !== original) {
      if (importStatement.length > 0) {
        output = ensureImportStatement(output, filePath, importStatement);
      }
      await fs.promises.writeFile(absolutePath, output);
    }
  }
}

function ensureImportStatement(content: string, filePath: string, importStatement: string) {
  if (content.includes(importStatement)) return content;
  const normalized = importStatement.endsWith(";") ? importStatement : `${importStatement};`;
  if (filePath.toLowerCase().endsWith(".vue")) {
    const scriptMatch = content.match(/<script\b[^>]*>/i);
    if (!scriptMatch || scriptMatch.index === undefined) return content;
    const insertPos = scriptMatch.index + scriptMatch[0].length;
    return `${content.slice(0, insertPos)}\n${normalized}\n${content.slice(insertPos)}`;
  }
  return `${normalized}\n${content}`;
}
