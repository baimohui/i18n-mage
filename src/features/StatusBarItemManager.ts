import { getConfig } from "@/utils/config";
import * as vscode from "vscode";

export class StatusBarItemManager {
  private static instance: StatusBarItemManager;
  private displayLanguageItem: vscode.StatusBarItem | null;
  private referenceLanguageItem: vscode.StatusBarItem | null;
  private disposed = false;

  constructor() {
    this.displayLanguageItem = null;
    this.referenceLanguageItem = null;
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
  }

  public update() {
    const displayLanguage = getConfig<string>("general.displayLanguage", "");
    if (this.displayLanguageItem && displayLanguage) {
      this.displayLanguageItem.text = `👁️ ${displayLanguage}`;
      this.displayLanguageItem.command = "i18nMage.setDisplayLang";
      this.displayLanguageItem.show();
    } else {
      this.hideDisplayLanguageItem();
    }

    const referenceLanguage = getConfig<string>("translationServices.referenceLanguage", "");
    if (this.referenceLanguageItem && referenceLanguage) {
      this.referenceLanguageItem.text = `🌐 ${referenceLanguage}`;
      this.referenceLanguageItem.command = "i18nMage.setReferredLang";
      this.referenceLanguageItem.show();
    } else {
      this.hideReferenceLanguageItem();
    }
  }

  public hideDisplayLanguageItem() {
    this.displayLanguageItem?.hide();
  }

  public hideReferenceLanguageItem() {
    this.referenceLanguageItem?.hide();
  }

  dispose(): void {
    this.displayLanguageItem?.dispose();
    this.referenceLanguageItem?.dispose();
    this.disposed = true;
  }
}
