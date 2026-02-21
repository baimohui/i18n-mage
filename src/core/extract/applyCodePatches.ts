import fs from "fs";
import { FixedTEntry } from "@/types";
import { toAbsolutePath } from "@/utils/fs";
import path from "path";

interface InjectionStrategy {
  importLines: string[];
  setupLines: string[];
}

interface ApplyCodePatchOptions {
  vueScript?: InjectionStrategy;
  jsTs?: InjectionStrategy;
}

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

export async function applyCodePatches(patchedEntryIdInfo: Record<string, FixedTEntry[]>, options: ApplyCodePatchOptions = {}) {
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
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".vue") {
        output = ensureVueInjection(output, options.vueScript);
      } else if ([".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(ext)) {
        output = ensureScriptInjection(output, options.jsTs);
      }
      await fs.promises.writeFile(absolutePath, output);
    }
  }
}

function normalizeLines(lines: string[]) {
  return lines
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => (item.endsWith(";") ? item : `${item};`));
}

function ensureScriptInjection(content: string, strategy?: InjectionStrategy) {
  if (!strategy) return content;
  const imports = normalizeLines(strategy.importLines);
  const setups = normalizeLines(strategy.setupLines);
  if (imports.length === 0 && setups.length === 0) return content;

  const chunks: string[] = [];
  imports.forEach(line => {
    if (!content.includes(line)) chunks.push(line);
  });
  setups.forEach(line => {
    if (!content.includes(line)) chunks.push(line);
  });

  if (chunks.length === 0) return content;
  return `${chunks.join("\n")}\n${content}`;
}

function ensureVueInjection(content: string, strategy?: InjectionStrategy) {
  if (!strategy) return content;
  const imports = normalizeLines(strategy.importLines);
  const setups = normalizeLines(strategy.setupLines);
  if (imports.length === 0 && setups.length === 0) return content;

  const scriptMatch = content.match(/<script\b[^>]*>/i);
  if (!scriptMatch || scriptMatch.index === undefined) {
    const injectedBody = [...imports, ...setups].join("\n");
    return `<script setup>\n${injectedBody}\n</script>\n${content}`;
  }
  const insertPos = scriptMatch.index + scriptMatch[0].length;
  const existingScriptEnd = content.indexOf("</script>", insertPos);
  const scriptBody = existingScriptEnd >= 0 ? content.slice(insertPos, existingScriptEnd) : content.slice(insertPos);

  const chunks: string[] = [];
  imports.forEach(line => {
    if (!scriptBody.includes(line)) chunks.push(line);
  });
  setups.forEach(line => {
    if (!scriptBody.includes(line)) chunks.push(line);
  });
  if (chunks.length === 0) return content;

  return `${content.slice(0, insertPos)}\n${chunks.join("\n")}\n${content.slice(insertPos)}`;
}
