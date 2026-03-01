import LangMage from "@/core/LangMage";
import { getCacheConfig } from "@/utils/config";
import { t } from "@/utils/i18n";
import { ActiveEditorState } from "@/utils/activeEditorState";
import * as vscode from "vscode";

export class StatusBarItemManager {
  private static instance: StatusBarItemManager;
  private displayLanguageItem: vscode.StatusBarItem | null;
  private referenceLanguageItem: vscode.StatusBarItem | null;
  private currentFileDefinedCountItem: vscode.StatusBarItem | null;
  private disposed = false;

  constructor() {
    this.displayLanguageItem = null;
    this.referenceLanguageItem = null;
    this.currentFileDefinedCountItem = null;
  }

  public static getInstance(): StatusBarItemManager {
    if (StatusBarItemManager.instance === undefined || StatusBarItemManager.instance.disposed) {
      StatusBarItemManager.instance = new StatusBarItemManager();
    }
    return StatusBarItemManager.instance;
  }

  public createStatusBarItem() {
    this.displayLanguageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    this.referenceLanguageItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
    this.currentFileDefinedCountItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
  }

  public update() {
    const displayLanguage = getCacheConfig<string>("general.displayLanguage");
    const mage = LangMage.getInstance();
    if (mage.detectedLangList.length > 0 && this.displayLanguageItem && displayLanguage) {
      this.displayLanguageItem.text = `$(eye) ${displayLanguage}`;
      this.displayLanguageItem.tooltip = t("command.pick.selectDisplayLang");
      this.displayLanguageItem.command = "i18nMage.setDisplayLang";
      this.displayLanguageItem.show();
    } else {
      this.hideDisplayLanguageItem();
    }

    const referenceLanguage = getCacheConfig<string>("translationServices.referenceLanguage");
    if (mage.detectedLangList.length > 0 && this.referenceLanguageItem && referenceLanguage) {
      this.referenceLanguageItem.text = `$(globe) ${referenceLanguage}`;
      this.referenceLanguageItem.tooltip = t("command.pick.selectReferredLang");
      this.referenceLanguageItem.command = "i18nMage.setReferredLang";
      this.referenceLanguageItem.show();
    } else {
      this.hideReferenceLanguageItem();
    }

    const definedCount = ActiveEditorState.definedEntries.size;
    if (this.currentFileDefinedCountItem && definedCount > 0) {
      this.currentFileDefinedCountItem.text = `$(symbol-key) ${definedCount}`;
      this.currentFileDefinedCountItem.tooltip = `${t("tree.currentFile.defined")}: ${definedCount}`;
      this.currentFileDefinedCountItem.command = "i18nMage.browseTranslationsInFile";
      this.currentFileDefinedCountItem.show();
    } else {
      this.hideCurrentFileDefinedCountItem();
    }
  }

  public hideDisplayLanguageItem() {
    this.displayLanguageItem?.hide();
  }

  public hideReferenceLanguageItem() {
    this.referenceLanguageItem?.hide();
  }

  public hideCurrentFileDefinedCountItem() {
    this.currentFileDefinedCountItem?.hide();
  }

  dispose(): void {
    this.displayLanguageItem?.dispose();
    this.referenceLanguageItem?.dispose();
    this.currentFileDefinedCountItem?.dispose();
    this.disposed = true;
  }
}
