import fs from "fs";
import path from "path";
import * as ts from "typescript";
import { isValidI18nCallablePath } from "@/utils/regex";
import { getLangCode } from "@/utils/langKey";
import { getCacheConfig } from "@/utils/config";
import { validateLang } from "@/utils/regex/formatUtils";
import { ExtractCandidate, ExtractScanResult } from "./types";

interface ScanOptions {
  projectPath: string;
  sourceLanguage?: string;
  scopePath?: string;
  onlyExtractSourceLanguageText?: boolean;
  vueTemplateIncludeAttrs?: string[];
  vueTemplateExcludeAttrs?: string[];
}

export function scanHardcodedTextCandidates(options: ScanOptions): ExtractScanResult {
  const scanRoot = resolveScanRoot(options.projectPath, options.scopePath);
  const filePaths = readAllFiles(scanRoot);
  const candidates: ExtractCandidate[] = [];
  const translationFunctionNames = getTranslationFunctionNames();
  const sourceLanguageGuard = shouldUseSourceLanguageGuard(options.sourceLanguage, options.onlyExtractSourceLanguageText);

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".vue") {
      const fileContent = fs.readFileSync(filePath, "utf8");
      candidates.push(
        ...scanVueTemplateCandidates(
          filePath,
          fileContent,
          options.sourceLanguage,
          sourceLanguageGuard,
          options.vueTemplateIncludeAttrs,
          options.vueTemplateExcludeAttrs
        )
      );
      candidates.push(
        ...scanVueScriptCandidates(filePath, fileContent, translationFunctionNames, options.sourceLanguage, sourceLanguageGuard)
      );
      continue;
    }

    if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
      continue;
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    candidates.push(
      ...scanSourceCandidates(
        filePath,
        fileContent,
        getScriptKindByExt(ext),
        0,
        "js-string",
        translationFunctionNames,
        options.sourceLanguage,
        sourceLanguageGuard
      )
    );
  }

  return {
    candidates,
    scannedFiles: filePaths.length
  };
}

function getTranslationFunctionNames() {
  const configured = getCacheConfig<string[]>("i18nFeatures.translationFunctionNames", ["t"]);
  const list = Array.isArray(configured)
    ? configured.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (!list.includes("t")) {
    list.push("t");
  }
  return new Set(list);
}

function scanVueScriptCandidates(
  filePath: string,
  fileContent: string,
  translationFunctionNames: Set<string>,
  sourceLanguage?: string,
  sourceLanguageGuard = false
): ExtractCandidate[] {
  const candidates: ExtractCandidate[] = [];
  const scriptRegex = /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = scriptRegex.exec(fileContent)) !== null) {
    const block = match[0];
    const openTagEnd = block.indexOf(">");
    if (openTagEnd < 0) continue;
    const contentStart = match.index + openTagEnd + 1;
    const contentEnd = match.index + block.length - "</script>".length;
    if (contentEnd <= contentStart) continue;

    const scriptContent = fileContent.slice(contentStart, contentEnd);
    const isTs = /lang\s*=\s*["']ts["']/i.test(block) || /lang\s*=\s*["']tsx["']/i.test(block);
    const kind = isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    candidates.push(
      ...scanSourceCandidates(
        filePath,
        scriptContent,
        kind,
        contentStart,
        "vue-script-string",
        translationFunctionNames,
        sourceLanguage,
        sourceLanguageGuard
      )
    );
  }

  return candidates;
}

function scanVueTemplateCandidates(
  filePath: string,
  fileContent: string,
  sourceLanguage?: string,
  sourceLanguageGuard = false,
  includeAttrs: string[] = [],
  excludeAttrs: string[] = []
): ExtractCandidate[] {
  const candidates: ExtractCandidate[] = [];
  const templateRegex = /<template\b[^>]*>[\s\S]*?<\/template>/gi;
  let match: RegExpExecArray | null = null;
  const includeSet = new Set(includeAttrs.map(item => item.toLowerCase()));
  const excludeSet = new Set(excludeAttrs.map(item => item.toLowerCase()));

  while ((match = templateRegex.exec(fileContent)) !== null) {
    const block = match[0];
    const openTagEnd = block.indexOf(">");
    if (openTagEnd < 0) continue;
    const closeTagStart = block.lastIndexOf("</template>");
    if (closeTagStart <= openTagEnd) continue;
    const contentStart = match.index + openTagEnd + 1;
    const contentEnd = match.index + closeTagStart;
    if (contentEnd <= contentStart) continue;
    const templateContent = fileContent.slice(contentStart, contentEnd);

    const attrRegex = /([:@]?[A-Za-z_][\w-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let attrMatch: RegExpExecArray | null = null;
    while ((attrMatch = attrRegex.exec(templateContent)) !== null) {
      const attrName = attrMatch[1] ?? "";
      if (attrName.startsWith(":") || attrName.startsWith("@") || attrName.startsWith("v-")) continue;
      const normalizedAttrName = attrName.toLowerCase();
      if (includeSet.size > 0 && !includeSet.has(normalizedAttrName)) continue;
      if (excludeSet.has(normalizedAttrName)) continue;
      const text = (attrMatch[3] ?? attrMatch[4] ?? "").trim();
      if (!isExtractableText(text, sourceLanguage, sourceLanguageGuard)) continue;

      const fullMatch = attrMatch[0];
      const fullMatchStartInTemplate = attrMatch.index;
      const start = contentStart + fullMatchStartInTemplate;
      const end = start + fullMatch.length;
      candidates.push({
        id: `${filePath}:${start}:${end}`,
        file: filePath,
        text,
        start,
        end,
        raw: fullMatch,
        context: "vue-template-attr",
        attrName
      });
    }

    const textRegex = />([^<>{}\n][^<>{}]*)</g;
    let textMatch: RegExpExecArray | null = null;
    while ((textMatch = textRegex.exec(templateContent)) !== null) {
      const rawText = textMatch[1] ?? "";
      const text = rawText.trim();
      if (!isExtractableText(text, sourceLanguage, sourceLanguageGuard)) continue;
      const textOffset = rawText.indexOf(text);
      if (textOffset < 0) continue;
      const start = contentStart + textMatch.index + 1 + textOffset;
      const end = start + text.length;
      candidates.push({
        id: `${filePath}:${start}:${end}`,
        file: filePath,
        text,
        start,
        end,
        raw: text,
        context: "vue-template-text"
      });
    }
  }

  return candidates;
}

function scanSourceCandidates(
  filePath: string,
  code: string,
  scriptKind: ts.ScriptKind,
  offset: number,
  context: ExtractCandidate["context"],
  translationFunctionNames: Set<string>,
  sourceLanguage?: string,
  sourceLanguageGuard = false
): ExtractCandidate[] {
  const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true, scriptKind);
  const results: ExtractCandidate[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (shouldSkipNode(node, translationFunctionNames)) {
        return;
      }
      const text = node.text.trim();
      if (!isExtractableText(text, sourceLanguage, sourceLanguageGuard)) {
        return;
      }
      const start = node.getStart(sourceFile) + offset;
      const end = node.getEnd() + offset;
      results.push({
        id: `${filePath}:${start}:${end}`,
        file: filePath,
        text,
        start,
        end,
        raw: node.getText(sourceFile),
        context
      });
      return;
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return results;
}

function shouldSkipNode(node: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral, translationFunctionNames: Set<string>) {
  const parent = node.parent;

  if (
    ts.isImportDeclaration(parent) ||
    ts.isExportDeclaration(parent) ||
    ts.isLiteralTypeNode(parent) ||
    ts.isTypeAliasDeclaration(parent)
  ) {
    return true;
  }

  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return true;
  }

  if (ts.isJsxAttribute(parent) || ts.isJsxElement(parent) || ts.isJsxSelfClosingElement(parent)) {
    return true;
  }

  if (isTranslationFunctionArgument(node, translationFunctionNames)) {
    return true;
  }

  return false;
}

function isTranslationFunctionArgument(node: ts.Node, translationFunctionNames: Set<string>) {
  let current: ts.Node | undefined = node;
  while (current !== undefined) {
    const parentNode = current.parent as ts.Node | undefined;
    if (parentNode === undefined) break;
    if (ts.isCallExpression(parentNode)) {
      const inArgs = parentNode.arguments.some(arg => arg === current);
      if (!inArgs) return false;
      const calleeName = getCallExpressionName(parentNode.expression);
      return calleeName !== "" && translationFunctionNames.has(calleeName);
    }
    if (ts.isFunctionLike(parentNode) || ts.isClassLike(parentNode) || ts.isSourceFile(parentNode)) {
      break;
    }
    current = parentNode;
  }
  return false;
}

function getCallExpressionName(expression: ts.Expression): string {
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return "";
}

function isExtractableText(text: string, sourceLanguage?: string, sourceLanguageGuard = false) {
  if (text.length === 0) return false;
  if (/^\s+$/.test(text)) return false;
  if (/^[./@_\w-]+$/.test(text)) return false;
  if (/^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(text)) return false;
  if (/^(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)$/i.test(text)) return false;
  if (/^var\(--[\w-]+\)$/i.test(text)) return false;
  if (/^-?\d+(?:\.\d+)?(?:px|r?em|vh|vw|vmin|vmax|%)$/i.test(text)) return false;
  if (/^\d+(?:\.\d+)?$/.test(text)) return false;
  if (!/[\p{L}]/u.test(text)) return false;
  if (sourceLanguageGuard && typeof sourceLanguage === "string" && sourceLanguage.trim().length > 0) {
    return validateLang(text, sourceLanguage);
  }
  return true;
}

function shouldUseSourceLanguageGuard(sourceLanguage?: string, onlyExtractSourceLanguageText?: boolean) {
  if (onlyExtractSourceLanguageText !== true) return false;
  if (typeof sourceLanguage !== "string" || sourceLanguage.trim().length === 0) return false;
  const code = getLangCode(sourceLanguage);
  return (
    code === "zh-CN" ||
    code === "zh-TW" ||
    code === "ja" ||
    code === "ko" ||
    code === "ru" ||
    code === "ar" ||
    code === "th" ||
    code === "hi" ||
    code === "vi"
  );
}

function readAllFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    return [dir];
  }
  const result: string[] = [];
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    const isDir = dirent.isDirectory();
    if (!isValidI18nCallablePath(fullPath, isDir)) {
      continue;
    }
    if (isDir) {
      result.push(...readAllFiles(fullPath));
    } else {
      result.push(fullPath);
    }
  }
  return result;
}

function resolveScanRoot(projectPath: string, scopePath?: string) {
  if (typeof scopePath !== "string" || scopePath.trim().length === 0) {
    return projectPath;
  }
  const normalized = scopePath.trim();
  return path.isAbsolute(normalized) ? normalized : path.join(projectPath, normalized);
}

function getScriptKindByExt(ext: string) {
  if (ext === ".ts") return ts.ScriptKind.TS;
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}
