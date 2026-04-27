import * as vscode from "vscode";
import path from "path";
import LangMage from "@/core/LangMage";
import { treeInstance } from "@/views/tree";
import { formatEscapeChar, resolveEntryKeyFromName } from "@/utils/regex";
import { getCacheConfig } from "@/utils/config";
import { INLINE_HINTS_DISPLAY_MODE, InlineHintsDisplayMode } from "@/types";
import { ActiveEditorState } from "@/utils/activeEditorState";
import { getFileSizeKB, isFileTooLarge, isPathInsideDirectory } from "@/utils/fs";
import { getLangCode } from "@/utils/langKey";

type DecorationData = {
  startPos: number;
  endPos: number;
  value: string;
  isLooseMatch: boolean;
  /** 缓存 positionAt 结果，避免在 applyDecorations 中重复计算 */
  startPosition?: vscode.Position;
  endPosition?: vscode.Position;
};

export class DecoratorController implements vscode.Disposable {
  private static instance: DecoratorController;
  private translationDecoration: vscode.TextEditorDecorationType;
  private looseTranslationDecoration: vscode.TextEditorDecorationType;
  private hiddenKeyDecoration: vscode.TextEditorDecorationType;
  private disposed = false;

  private decorationsByEditor = new Map<string, DecorationData[]>();
  private lastCursorLineByEditor = new Map<string, number>();
  private visibleEditorKeys = new Set<string>();
  private decorationModeByEditor = new Map<string, "usage" | "langFile">();

  constructor() {
    this.translationDecoration = this.setTranslationDecoration();
    this.looseTranslationDecoration = this.setTranslationDecoration(true);
    this.hiddenKeyDecoration = vscode.window.createTextEditorDecorationType({
      textDecoration: "none; opacity: 0; position: absolute; width: 0; height: 0; overflow: hidden;"
    });
  }

  public static getInstance(): DecoratorController {
    if (DecoratorController.instance === undefined || DecoratorController.instance.disposed) {
      DecoratorController.instance = new DecoratorController();
    }
    return DecoratorController.instance;
  }

  public updateVisibleEditors(
    editors: readonly vscode.TextEditor[] = vscode.window.visibleTextEditors,
    options: { force?: boolean } = {}
  ): void {
    if (this.disposed) return;
    const { force = true } = options;
    const nextVisibleKeys = new Set(editors.map(editor => this.getEditorKey(editor)));
    this.visibleEditorKeys.forEach(key => {
      if (!nextVisibleKeys.has(key)) {
        this.decorationsByEditor.delete(key);
        this.lastCursorLineByEditor.delete(key);
      }
    });
    this.visibleEditorKeys = nextVisibleKeys;
    editors.forEach(editor => {
      const editorKey = this.getEditorKey(editor);
      if (!force && this.decorationsByEditor.has(editorKey)) return;
      ActiveEditorState.update(editor);
      this.update(editor);
    });
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      ActiveEditorState.update(activeEditor);
    }
  }

  public update(editor: vscode.TextEditor | undefined): void {
    if (this.disposed || !editor) return;
    const editorKey = this.getEditorKey(editor);

    if (!getCacheConfig<boolean>("translationHints.enable")) {
      this.clearEditorDecorations(editor, editorKey);
      return;
    }

    const langFileCtx = this.getLanguageFileContext(editor);
    if (langFileCtx) {
      const langFileDecorations = this.buildLanguageFileDecorations(editor, langFileCtx);
      this.decorationsByEditor.set(editorKey, langFileDecorations);
      this.decorationModeByEditor.set(editorKey, "langFile");
      this.applyLanguageFileDecorations(editor, langFileDecorations);
      return;
    }

    if (isFileTooLarge(editor.document.uri.fsPath)) {
      this.clearEditorDecorations(editor, editorKey);
      return;
    }

    const mage = LangMage.getInstance();
    const { tree, countryMap } = mage.langDetail;
    const translations = countryMap[treeInstance.displayLang];
    if (translations === undefined) {
      this.clearEditorDecorations(editor, editorKey);
      return;
    }
    const visibleOnly = this.shouldRenderVisibleOnly(editor);
    const entries = Array.from(ActiveEditorState.definedEntries.values())
      .flat()
      .filter(item => !visibleOnly || item.visible);
    const maxLen = getCacheConfig<number>("translationHints.maxLength");
    const enableLooseKeyMatch = getCacheConfig<boolean>("translationHints.enableLooseKeyMatch");
    const dynamicMatchInfo = ActiveEditorState.dynamicMatchInfo;
    const applyToStringLiterals = getCacheConfig<boolean>("translationHints.applyToStringLiterals");

    const currentDecorations: DecorationData[] = [];

    entries.forEach(entry => {
      if (!applyToStringLiterals && !entry.funcCall) return;

      let [startPos, endPos] = entry.pos.split(",").map(Number);
      startPos++;
      endPos--;

      let entryKey = "";
      let entryValue = "";
      let isLooseMatch = false;

      if (entry.dynamic && dynamicMatchInfo.has(entry.nameInfo.name)) {
        if (!enableLooseKeyMatch) return;
        isLooseMatch = true;
        const matchedNames = dynamicMatchInfo.get(entry.nameInfo.name) || [];
        const matchedKeys = matchedNames.map(name => resolveEntryKeyFromName(tree, name)).filter((key): key is string => key !== undefined);
        entryValue = matchedKeys.map(key => translations[key]).join(" | ");
      } else {
        entryKey = entry.nameInfo.key;
        entryValue = entryKey ? translations[entryKey] : "";
      }

      if (!entryValue) return;

      // 优化：在构建 DecorationData 时缓存 positionAt 结果
      const startPosition = editor.document.positionAt(startPos);
      const endPosition = editor.document.positionAt(endPos);
      currentDecorations.push({
        startPos,
        endPos,
        value: this.formatEntryValue(entryValue, maxLen),
        isLooseMatch,
        startPosition,
        endPosition
      });
    });

    this.decorationsByEditor.set(editorKey, currentDecorations);
    this.decorationModeByEditor.set(editorKey, "usage");
    this.applyDecorations(editor, currentDecorations);
  }

  public handleCursorMove(event: vscode.TextEditorSelectionChangeEvent): void {
    const editor = event.textEditor;
    const editorKey = this.getEditorKey(editor);
    const cursorLine = event.selections[0].active.line;
    const prevCursorLine = this.lastCursorLineByEditor.get(editorKey);

    if (cursorLine === prevCursorLine) return;

    this.lastCursorLineByEditor.set(editorKey, cursorLine);
    const decorations = this.decorationsByEditor.get(editorKey);
    if (!decorations) return;

    const mode = this.decorationModeByEditor.get(editorKey) ?? "usage";
    if (mode === "langFile") {
      this.applyLanguageFileDecorations(editor, decorations);
    } else {
      // 优化：增量更新，只重新计算受光标移动影响的装饰项
      // 只有上一行和当前行的装饰渲染模式可能改变（overlay ↔ inline）
      this.applyDecorationsIncremental(editor, decorations, prevCursorLine, cursorLine);
    }
  }

  public handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (event.contentChanges.length === 0) return;

    const editors = vscode.window.visibleTextEditors.filter(editor => editor.document === event.document);
    if (editors.length === 0) return;

    editors.forEach(editor => {
      if (!this.shouldRenderVisibleOnly(editor)) {
        ActiveEditorState.update(editor);
        this.update(editor);
        return;
      }
      let affected = false;
      const changedTextSnippets: string[] = [];
      const visibleRanges = editor.visibleRanges;
      const visibleStart = Math.min(...visibleRanges.map(r => r.start.line));
      const visibleEnd = Math.max(...visibleRanges.map(r => r.end.line));

      for (const change of event.contentChanges) {
        const startLine = change.range.start.line;
        const endLine = change.range.end.line;
        if (!change.range.isSingleLine || (endLine >= visibleStart && startLine <= visibleEnd)) {
          affected = true;
        }
        changedTextSnippets.push(change.text);
      }

      const fullText = changedTextSnippets.join("\n");
      if (
        affected ||
        fullText.includes("\n") ||
        Array.from(ActiveEditorState.definedEntries.values())
          .flat()
          .some(item => item.visible)
      ) {
        ActiveEditorState.update(editor);
        this.update(editor);
      }
    });
  }

  public handleVisibleRangesChange(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    // 优化：滚动时只更新可见性标记，不触发全量重解析（ActiveEditorState.update）
    // 文件内容未变，仅可视区域变化，无需重新解析整个文件
    ActiveEditorState.updateVisibleEntries(event.textEditor);
    this.update(event.textEditor);
  }

  public shouldRenderVisibleOnly(editor: vscode.TextEditor): boolean {
    const fullFileMaxSizeKB = getCacheConfig<number>("translationHints.fullFileMaxSizeKB", 50);
    if (fullFileMaxSizeKB === -1) return false;
    if (fullFileMaxSizeKB <= 0) return true;
    const fileSizeKB = getFileSizeKB(editor.document.uri.fsPath);
    if (fileSizeKB === null) return true;
    return fileSizeKB > fullFileMaxSizeKB;
  }

  public updateTranslationDecoration() {
    this.translationDecoration.dispose();
    this.looseTranslationDecoration.dispose();
    this.translationDecoration = this.setTranslationDecoration();
    this.looseTranslationDecoration = this.setTranslationDecoration(true);
    this.updateVisibleEditors();
  }

  private formatEntryValue(entryValue: string, maxLen?: number): string {
    const formattedEntryValue = formatEscapeChar(entryValue);
    if (maxLen === undefined || formattedEntryValue.length <= maxLen) return formattedEntryValue;
    return formattedEntryValue.slice(0, maxLen) + "...";
  }

  /**
   * 增量更新装饰：只重新计算受光标移动影响的行（上一行和当前行）的装饰渲染模式。
   * 其他行的装饰保持不变，避免全量重建 DecorationOptions 数组。
   */
  private applyDecorationsIncremental(
    editor: vscode.TextEditor,
    decorations: DecorationData[],
    prevCursorLine: number | undefined,
    cursorLine: number
  ): void {
    const isInline = getCacheConfig<InlineHintsDisplayMode>("translationHints.displayMode") === INLINE_HINTS_DISPLAY_MODE.inline;
    if (isInline) {
      // inline 模式下所有装饰都是 appended 模式，不受光标影响，无需增量更新
      this.applyDecorations(editor, decorations);
      return;
    }

    const isItalic = getCacheConfig<boolean>("translationHints.italic");
    const translationDecorations: vscode.DecorationOptions[] = [];
    const looseTranslationDecorations: vscode.DecorationOptions[] = [];
    const hiddenKeyDecorations: vscode.DecorationOptions[] = [];

    // 只处理上一行和当前行范围内的装饰项
    const affectedLines = new Set<number>();
    if (prevCursorLine !== undefined) affectedLines.add(prevCursorLine);
    affectedLines.add(cursorLine);

    decorations.forEach(({ startPos, endPos, value, isLooseMatch, startPosition, endPosition }) => {
      let adjStartPos = startPos;
      let adjEndPos = endPos;
      if (isLooseMatch) {
        adjStartPos = startPos - 1;
        adjEndPos = endPos + 1;
      }

      const globalStartPos = startPosition && !isLooseMatch ? startPosition : editor.document.positionAt(adjStartPos);
      let globalEndPos = endPosition && !isLooseMatch ? endPosition : editor.document.positionAt(adjEndPos);

      // 判断该装饰是否在受影响的行范围内
      const isAffected = affectedLines.has(globalStartPos.line) || affectedLines.has(globalEndPos.line);
      const isOnCursorLine = globalStartPos.line <= cursorLine && globalEndPos.line >= cursorLine;

      if (isAffected) {
        // 受影响的行：根据光标位置重新决定渲染模式
        if (isOnCursorLine) {
          if (isLooseMatch) {
            const document = editor.document;
            const text = document.getText();
            const searchStart = Math.max(adjStartPos, 0);
            const searchEnd = Math.min(adjEndPos - 1, text.length - 1);
            let quotePosition: number | null = null;
            for (let i = searchEnd; i >= searchStart; i--) {
              if (text[i] === '"' || text[i] === "'" || text[i] === "`") {
                quotePosition = i;
                break;
              }
            }
            if (quotePosition !== null) {
              globalEndPos = document.positionAt(quotePosition);
            }
          }

          const range = new vscode.Range(globalEndPos, globalEndPos);
          const appendedDec: vscode.DecorationOptions = {
            range,
            renderOptions: { before: { contentText: ` → ${value}`, fontStyle: isItalic ? "italic" : "normal" } }
          };
          if (isLooseMatch) {
            looseTranslationDecorations.push(appendedDec);
          } else {
            translationDecorations.push(appendedDec);
          }
        } else {
          const range = new vscode.Range(globalStartPos, globalEndPos);
          const overlayDec: vscode.DecorationOptions = {
            range,
            renderOptions: { before: { contentText: isLooseMatch ? `"${value}"` : value, fontStyle: isItalic ? "italic" : "normal" } }
          };
          if (isLooseMatch) {
            looseTranslationDecorations.push(overlayDec);
          } else {
            translationDecorations.push(overlayDec);
          }
          hiddenKeyDecorations.push({ range: new vscode.Range(globalStartPos, globalEndPos) });
        }
      } else {
        // 不受影响的行：保持原有渲染模式（根据当前光标位置判断）
        if (isOnCursorLine) {
          const range = new vscode.Range(globalEndPos, globalEndPos);
          const appendedDec: vscode.DecorationOptions = {
            range,
            renderOptions: { before: { contentText: ` → ${value}`, fontStyle: isItalic ? "italic" : "normal" } }
          };
          if (isLooseMatch) {
            looseTranslationDecorations.push(appendedDec);
          } else {
            translationDecorations.push(appendedDec);
          }
        } else {
          const range = new vscode.Range(globalStartPos, globalEndPos);
          const overlayDec: vscode.DecorationOptions = {
            range,
            renderOptions: { before: { contentText: isLooseMatch ? `"${value}"` : value, fontStyle: isItalic ? "italic" : "normal" } }
          };
          if (isLooseMatch) {
            looseTranslationDecorations.push(overlayDec);
          } else {
            translationDecorations.push(overlayDec);
          }
          hiddenKeyDecorations.push({ range: new vscode.Range(globalStartPos, globalEndPos) });
        }
      }
    });

    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.looseTranslationDecoration, looseTranslationDecorations);
    editor.setDecorations(this.hiddenKeyDecoration, hiddenKeyDecorations);
  }

  private applyDecorations(editor: vscode.TextEditor, decorations: DecorationData[]): void {
    const cursorLine = editor.selection.active.line;
    const translationDecorations: vscode.DecorationOptions[] = [];
    const looseTranslationDecorations: vscode.DecorationOptions[] = [];
    const hiddenKeyDecorations: vscode.DecorationOptions[] = [];
    const isInline = getCacheConfig<InlineHintsDisplayMode>("translationHints.displayMode") === INLINE_HINTS_DISPLAY_MODE.inline;
    const isItalic = getCacheConfig<boolean>("translationHints.italic");

    decorations.forEach(({ startPos, endPos, value, isLooseMatch, startPosition, endPosition }) => {
      // 优化：使用缓存的 positionAt 结果
      let adjStartPos = startPos;
      let adjEndPos = endPos;
      if (isLooseMatch) {
        adjStartPos = startPos - 1;
        adjEndPos = endPos + 1;
      }

      // 如果缓存了 Position 且不是 looseMatch（looseMatch 需要调整 offset），直接使用缓存
      const globalStartPos = startPosition && !isLooseMatch ? startPosition : editor.document.positionAt(adjStartPos);
      let globalEndPos = endPosition && !isLooseMatch ? endPosition : editor.document.positionAt(adjEndPos);
      const isOnCursorLine = globalStartPos.line <= cursorLine && globalEndPos.line >= cursorLine;

      if (isInline || isOnCursorLine) {
        if (isLooseMatch) {
          const document = editor.document;
          const text = document.getText();
          const searchStart = Math.max(adjStartPos, 0);
          const searchEnd = Math.min(adjEndPos - 1, text.length - 1);
          let quotePosition: number | null = null;
          for (let i = searchEnd; i >= searchStart; i--) {
            if (text[i] === '"' || text[i] === "'" || text[i] === "`") {
              quotePosition = i;
              break;
            }
          }
          if (quotePosition !== null) {
            globalEndPos = document.positionAt(quotePosition);
          }
        }

        const range = new vscode.Range(globalEndPos, globalEndPos);
        const appendedDec: vscode.DecorationOptions = {
          range,
          renderOptions: { before: { contentText: ` → ${value}`, fontStyle: isItalic ? "italic" : "normal" } }
        };
        if (isLooseMatch) {
          looseTranslationDecorations.push(appendedDec);
        } else {
          translationDecorations.push(appendedDec);
        }
      } else {
        const range = new vscode.Range(globalStartPos, globalEndPos);
        const overlayDec: vscode.DecorationOptions = {
          range,
          renderOptions: { before: { contentText: isLooseMatch ? `"${value}"` : value, fontStyle: isItalic ? "italic" : "normal" } }
        };
        if (isLooseMatch) {
          looseTranslationDecorations.push(overlayDec);
        } else {
          translationDecorations.push(overlayDec);
        }
        hiddenKeyDecorations.push({ range: new vscode.Range(globalStartPos, globalEndPos) });
      }
    });

    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.looseTranslationDecoration, looseTranslationDecorations);
    editor.setDecorations(this.hiddenKeyDecoration, hiddenKeyDecorations);
  }

  private getEditorKey(editor: vscode.TextEditor): string {
    return `${editor.document.uri.toString()}::${editor.viewColumn ?? "NA"}`;
  }

  private clearEditorDecorations(editor: vscode.TextEditor, editorKey: string): void {
    editor.setDecorations(this.translationDecoration, []);
    editor.setDecorations(this.looseTranslationDecoration, []);
    editor.setDecorations(this.hiddenKeyDecoration, []);
    this.decorationsByEditor.delete(editorKey);
    this.lastCursorLineByEditor.delete(editorKey);
    this.decorationModeByEditor.delete(editorKey);
  }

  private setTranslationDecoration(isLooseMatch: boolean = false) {
    const decoration: vscode.DecorationRenderOptions = {
      before: this.getDecoration("light"),
      dark: {
        before: this.getDecoration("dark")
      }
    };
    if (isLooseMatch) {
      decoration.before!.textDecoration = "underline dotted";
      decoration.dark!.before!.textDecoration = "underline dotted";
    }
    return vscode.window.createTextEditorDecorationType(decoration);
  }

  private getDecoration(theme: "light" | "dark"): { color: string; backgroundColor: string } {
    let hex = getCacheConfig<string>(`translationHints.${theme}.backgroundColor`);
    const alpha = getCacheConfig<number>(`translationHints.${theme}.backgroundAlpha`);
    let color = getCacheConfig<string>(`translationHints.${theme}.fontColor`);
    const isValidHexColor = (value: string): boolean => {
      return /^#([0-9a-fA-F]{6})$/.test(value.trim());
    };
    if (!isValidHexColor(hex)) {
      hex = theme === "light" ? "#569CD6" : "#4EC9B0";
    }
    if (!isValidHexColor(color)) {
      color = theme === "light" ? "#569CD6" : "#4EC9B0";
    }
    return {
      color,
      backgroundColor: this.hexToRgba(hex, alpha)
    };
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  dispose(): void {
    this.translationDecoration.dispose();
    this.looseTranslationDecoration.dispose();
    this.hiddenKeyDecoration.dispose();
    this.decorationsByEditor.clear();
    this.lastCursorLineByEditor.clear();
    this.visibleEditorKeys.clear();
    this.decorationModeByEditor.clear();
    this.disposed = true;
  }

  private getLanguageFileContext(editor: vscode.TextEditor): { lang: string; fileScope: string; filePathSegs: string[] } | null {
    const mage = LangMage.getInstance();
    const publicCtx = mage.getPublicContext();
    if (!publicCtx.langPath || !publicCtx.langFileType) return null;

    const filePath = editor.document.uri.fsPath;
    if (!isPathInsideDirectory(publicCtx.langPath, filePath)) return null;
    const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
    if (ext !== publicCtx.langFileType.toLowerCase()) return null;

    const relPath = path.relative(publicCtx.langPath, filePath);
    const relSegs = relPath.split(path.sep).filter(Boolean);
    if (relSegs.length === 0) return null;

    const detectedLangs = mage.detectedLangList;
    const matchLang = (value: string) => detectedLangs.find(lang => lang.toLowerCase() === value.toLowerCase());

    let lang = "";
    let fileSegs: string[] = [];
    const firstSegLang = matchLang(relSegs[0]);
    if (typeof firstSegLang === "string" && firstSegLang.length > 0) {
      lang = firstSegLang;
      fileSegs = relSegs.slice(1);
    } else if (relSegs.length === 1) {
      const base = path.basename(relSegs[0], path.extname(relSegs[0]));
      const baseLang = matchLang(base);
      if (typeof baseLang !== "string" || baseLang.length === 0) return null;
      lang = baseLang;
      fileSegs = [];
    } else {
      return null;
    }

    let fileScope = "";
    if (fileSegs.length > 0) {
      const scopeSegs = fileSegs.slice();
      scopeSegs[scopeSegs.length - 1] = path.basename(scopeSegs[scopeSegs.length - 1], path.extname(scopeSegs[scopeSegs.length - 1]));
      fileScope = scopeSegs.join(".");
    }

    return { lang, fileScope, filePathSegs: fileSegs };
  }

  private buildLanguageFileDecorations(
    editor: vscode.TextEditor,
    ctx: { lang: string; fileScope: string; filePathSegs: string[] }
  ): DecorationData[] {
    const mage = LangMage.getInstance();
    const dictionary = mage.langDetail.dictionary;
    const displayLang = treeInstance.displayLang || getCacheConfig<string>("general.displayLanguage");
    const referenceLang = getCacheConfig<string>("translationServices.referenceLanguage");
    const maxLen = getCacheConfig<number>("translationHints.maxLength");
    const visibleOnly = this.shouldRenderVisibleOnly(editor);
    const visibleRanges = visibleOnly ? editor.visibleRanges : [];
    const hasDisplayLang = typeof displayLang === "string" && displayLang.trim().length > 0;
    const hasReferenceLang = typeof referenceLang === "string" && referenceLang.trim().length > 0;

    const isSameLang = (a: string, b: string) => {
      if (!a || !b) return false;
      const aCode = getLangCode(a) ?? a.toLowerCase();
      const bCode = getLangCode(b) ?? b.toLowerCase();
      return aCode === bCode;
    };

    const isDisplayLangFile = hasDisplayLang && isSameLang(ctx.lang, displayLang);
    const showReferenceInDisplay = isDisplayLangFile && hasReferenceLang && hasDisplayLang && !isSameLang(referenceLang, displayLang);
    const showDisplayInNonDisplay = hasDisplayLang && !isDisplayLangFile;

    if (!showReferenceInDisplay && !showDisplayInNonDisplay) return [];

    const doc = editor.document;
    const text = doc.getText();
    const decorations: DecorationData[] = [];

    for (const [key, entry] of Object.entries(dictionary)) {
      if (ctx.fileScope !== "" && entry.fileScope !== ctx.fileScope) continue;

      const fullKey = entry.fullPath || key;
      let realKey = fullKey;
      if (ctx.fileScope !== "" && fullKey.startsWith(`${ctx.fileScope}.`)) {
        realKey = fullKey.slice(ctx.fileScope.length + 1);
      }

      const valueRange = this.getValueRangeForKey(doc, text, realKey);
      if (!valueRange) continue;
      if (visibleOnly && !visibleRanges.some(vr => vr.intersection(valueRange))) continue;

      let hintValue = "";
      if (showDisplayInNonDisplay && hasDisplayLang) {
        hintValue = entry.value?.[displayLang] ?? "";
      } else if (showReferenceInDisplay && hasReferenceLang) {
        hintValue = entry.value?.[referenceLang] ?? "";
      }

      if (!hintValue) continue;

      const startPos = doc.offsetAt(valueRange.start);
      const endPos = doc.offsetAt(valueRange.end);
      decorations.push({
        startPos,
        endPos,
        value: this.formatEntryValue(hintValue, maxLen),
        isLooseMatch: false
      });
    }

    return decorations;
  }

  private applyLanguageFileDecorations(editor: vscode.TextEditor, decorations: DecorationData[]): void {
    const translationDecorations: vscode.DecorationOptions[] = [];
    const isItalic = getCacheConfig<boolean>("translationHints.italic");

    decorations.forEach(({ endPos, value }) => {
      const globalEndPos = editor.document.positionAt(endPos);
      const range = new vscode.Range(globalEndPos, globalEndPos);
      translationDecorations.push({
        range,
        renderOptions: { before: { contentText: ` → ${value}`, fontStyle: isItalic ? "italic" : "normal" } }
      });
    });

    editor.setDecorations(this.translationDecoration, translationDecorations);
    editor.setDecorations(this.looseTranslationDecoration, []);
    editor.setDecorations(this.hiddenKeyDecoration, []);
  }

  private getValueRangeForKey(doc: vscode.TextDocument, text: string, key: string): vscode.Range | null {
    const ext = path.extname(doc.uri.fsPath).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") {
      return this.getYamlValueRange(doc, key);
    }
    return this.getJsonLikeValueRange(doc, text, key);
  }

  private getJsonLikeValueRange(doc: vscode.TextDocument, text: string, key: string): vscode.Range | null {
    const isEndWithNum = key.match(/\.(\d+)$/);
    const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
    let searchStart = 0;
    let valueStart: number | undefined;
    let valueEnd: number | undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const isBeforeLast = i === parts.length - 2;
      const keyEsc = this.escapeReg(part);
      const lookaround = `(?<![\\w$])["']?${keyEsc}["']?(?![\\w$])`;
      const suffix = isLast ? "" : "\\s*[\\{\\[]";
      const pat = new RegExp(lookaround + `\\s*:` + suffix);
      const m = pat.exec(text.slice(searchStart));
      if (!m) return null;
      const matchIndex = searchStart + m.index;

      if (isLast || (isBeforeLast && isEndWithNum)) {
        const colonIndex = text.indexOf(":", matchIndex);
        if (colonIndex < 0) return null;
        const bounds = this.findJsonLikeValueBounds(text, colonIndex + 1);
        if (!bounds) return null;
        valueStart = bounds.start;
        valueEnd = bounds.end;
        break;
      }

      const objStart = matchIndex + m[0].length;
      const subText = text.slice(objStart);
      const closeIdx = this.findMatchingBrace(subText);
      if (closeIdx < 0) return null;
      searchStart = objStart;
    }

    if (valueStart !== undefined && valueEnd !== undefined) {
      const startPos = doc.positionAt(valueStart);
      const endPos = doc.positionAt(valueEnd);
      return new vscode.Range(startPos, endPos);
    }
    return null;
  }

  private findJsonLikeValueBounds(text: string, startAt: number): { start: number; end: number } | null {
    let i = startAt;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (ch === "/" && next === "/") {
        i += 2;
        while (i < text.length && text[i] !== "\n") i++;
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      break;
    }

    const start = i;
    if (start >= text.length) return null;
    const quote = text[start];
    if (quote !== '"' && quote !== "'" && quote !== "`") return null;

    let escaped = false;
    let braceDepth = 0;
    for (let j = start + 1; j < text.length; j++) {
      const ch = text[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (quote === "`") {
        if (ch === "$" && text[j + 1] === "{") {
          braceDepth++;
          j++;
          continue;
        }
        if (ch === "}" && braceDepth > 0) {
          braceDepth--;
          continue;
        }
      }
      if (ch === quote && braceDepth === 0) {
        return { start: start + 1, end: j };
      }
    }
    return null;
  }

  private getYamlValueRange(doc: vscode.TextDocument, key: string): vscode.Range | null {
    const keyRange = this.getYamlKeyRange(doc, key);
    if (!keyRange) return null;
    const line = doc.lineAt(keyRange.start.line);
    const lineText = line.text;
    const colonIndex = lineText.indexOf(":", keyRange.end.character);
    if (colonIndex < 0) return null;
    const after = lineText.slice(colonIndex + 1);
    const trimmed = after.trimStart();
    if (!trimmed || trimmed.startsWith("|") || trimmed.startsWith(">")) return null;

    const valueStartChar = lineText.length - trimmed.length;
    const valueStartPos = new vscode.Position(line.lineNumber, valueStartChar);

    let valueEndChar = lineText.length;
    const quote = trimmed[0];
    if (quote === '"' || quote === "'") {
      let escaped = false;
      for (let i = valueStartChar + 1; i < lineText.length; i++) {
        const ch = lineText[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          valueEndChar = i + 1;
          break;
        }
      }
    }

    const valueEndPos = new vscode.Position(line.lineNumber, valueEndChar);
    return new vscode.Range(valueStartPos, valueEndPos);
  }

  private getYamlKeyRange(doc: vscode.TextDocument, key: string): vscode.Range | null {
    const parts = key.split(/(?<!\\)\./).map(p => p.replace(/\\\./g, "."));
    if (parts.length === 0) return null;

    type Scope = { start: number; end: number; parentIndent: number };
    let scope: Scope = { start: 0, end: doc.lineCount - 1, parentIndent: -1 };
    let finalRange: vscode.Range | null = null;

    for (const seg of parts) {
      if (/^\d+$/.test(seg)) {
        const item = this.findYamlSequenceItem(doc, scope, Number(seg));
        if (item === null) return null;
        scope = {
          start: item.line + 1,
          end: item.blockEnd,
          parentIndent: item.indent
        };
        continue;
      }

      const found = this.findYamlMapKey(doc, scope, seg);
      if (found === null) return null;
      finalRange = found.range;
      scope = {
        start: found.line + 1,
        end: found.blockEnd,
        parentIndent: found.indent
      };
    }

    return finalRange;
  }

  private escapeReg(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private getLineIndent(lineText: string): number {
    const m = lineText.match(/^\s*/);
    return m ? m[0].length : 0;
  }

  private isYamlIgnorableLine(lineText: string): boolean {
    const trimmed = lineText.trim();
    return trimmed.length === 0 || trimmed.startsWith("#");
  }

  private findYamlBlockEnd(doc: vscode.TextDocument, fromLine: number, parentIndent: number, limitEnd: number): number {
    let last = limitEnd;
    for (let i = fromLine + 1; i <= limitEnd; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent <= parentIndent) {
        return i - 1;
      }
      last = i;
    }
    return last;
  }

  private findYamlMapKey(
    doc: vscode.TextDocument,
    scope: { start: number; end: number; parentIndent: number },
    keySeg: string
  ): { line: number; indent: number; blockEnd: number; range: vscode.Range } | null {
    const rawKeyEscaped = this.escapeReg(keySeg);
    const quotedPattern = new RegExp(`^\\s*(["'])${rawKeyEscaped}\\1\\s*:\\s*`);
    const plainPattern = new RegExp(`^\\s*${rawKeyEscaped}\\s*:\\s*`);
    const childIndent = this.findDirectChildIndent(doc, scope);
    if (childIndent === null) return null;

    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent !== childIndent) continue;
      if (text.slice(indent).startsWith("-")) continue;

      const quotedMatch = quotedPattern.exec(text);
      const plainMatch = plainPattern.exec(text);
      if (quotedMatch === null && plainMatch === null) continue;

      const keyStart = text.indexOf(keySeg, indent);
      if (keyStart < 0) continue;
      const startPos = new vscode.Position(i, keyStart);
      const endPos = new vscode.Position(i, keyStart + keySeg.length);
      return {
        line: i,
        indent,
        blockEnd: this.findYamlBlockEnd(doc, i, indent, scope.end),
        range: new vscode.Range(startPos, endPos)
      };
    }
    return null;
  }

  private findYamlSequenceItem(
    doc: vscode.TextDocument,
    scope: { start: number; end: number; parentIndent: number },
    targetIndex: number
  ): { line: number; indent: number; blockEnd: number } | null {
    const listIndent = this.findDirectSequenceIndent(doc, scope);
    if (listIndent === null) return null;
    let currentIdx = -1;

    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent !== listIndent) continue;
      const trimmed = text.trimStart();
      if (!trimmed.startsWith("-")) continue;

      currentIdx++;
      if (currentIdx !== targetIndex) continue;

      return {
        line: i,
        indent,
        blockEnd: this.findYamlBlockEnd(doc, i, indent, scope.end)
      };
    }
    return null;
  }

  private findDirectChildIndent(doc: vscode.TextDocument, scope: { start: number; end: number; parentIndent: number }): number | null {
    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent > scope.parentIndent) {
        return indent;
      }
    }
    return null;
  }

  private findDirectSequenceIndent(doc: vscode.TextDocument, scope: { start: number; end: number; parentIndent: number }): number | null {
    for (let i = scope.start; i <= scope.end; i++) {
      const text = doc.lineAt(i).text;
      if (this.isYamlIgnorableLine(text)) continue;
      const indent = this.getLineIndent(text);
      if (indent <= scope.parentIndent) continue;
      if (text.trimStart().startsWith("-")) {
        return indent;
      }
    }
    return null;
  }

  private findMatchingBrace(text: string): number {
    let depth = 1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
}
