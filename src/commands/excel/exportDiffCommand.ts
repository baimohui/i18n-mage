import * as fs from "fs";
import * as fsp from "fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { execFileSync } from "child_process";
import xlsx from "node-xlsx";
import LangMage from "@/core/LangMage";
import { registerDisposable } from "@/utils/dispose";
import { t } from "@/utils/i18n";
import { NotificationManager } from "@/utils/notification";
import { wrapWithProgress } from "@/utils/wrapWithProgress";
import { getLangText } from "@/utils/langKey";
import { LangDictionary } from "@/types";

type Snapshot = {
  dictionary: LangDictionary;
  detectedLangList: string[];
};

type DiffAction = "ADD" | "MODIFY" | "DELETE";

type DiffRecord = {
  action: DiffAction;
  key: string;
  changedLangs: string[];
  oldValues: Record<string, string>;
  newValues: Record<string, string>;
};

type CommitPick = vscode.QuickPickItem & { hash: string };
type RepoMeta = {
  projectName: string;
  branchName: string;
  headShort: string;
  headHash: string;
  headDate: string;
  headSubject: string;
  dirty: boolean;
};

const MAX_COMMIT_OPTIONS = 80;

export function registerExportDiffCommand() {
  const mage = LangMage.getInstance();

  const disposable = vscode.commands.registerCommand("i18nMage.exportDiff", async () => {
    NotificationManager.showTitle(t("command.exportDiff.title"));
    const publicCtx = mage.getPublicContext();
    if (!publicCtx.langPath || !publicCtx.projectPath) {
      NotificationManager.showWarning(t("common.noLangPathDetectedWarn"));
      return;
    }

    const currentSnapshot = await withCurrentSnapshot(mage, publicCtx.langPath, () => takeSnapshot(mage));
    if (currentSnapshot.detectedLangList.length === 0) {
      NotificationManager.showWarning(t("common.noLangPathDetectedWarn"));
      return;
    }

    const relativeLangPath = normalizeGitPath(path.relative(publicCtx.projectPath, publicCtx.langPath));
    if (!relativeLangPath || relativeLangPath.startsWith("..")) {
      NotificationManager.showError(t("command.exportDiff.langPathOutsideProject"));
      return;
    }

    const commit = await pickBaselineCommit(publicCtx.projectPath, relativeLangPath);
    if (!commit) {
      return;
    }

    const repoMeta = getRepoMeta(publicCtx.projectPath);
    const defaultName = `${repoMeta.projectName}-i18n-diff-${commit.hash.slice(0, 7)}-${formatDate(new Date())}.xlsx`;
    const fileUri = await vscode.window.showSaveDialog({
      saveLabel: t("command.exportDiff.dialogTitle"),
      defaultUri: vscode.Uri.file(path.join(publicCtx.projectPath, defaultName)),
      filters: {
        "Excel files": ["xlsx", "xls"]
      }
    });
    if (!fileUri) {
      return;
    }

    await wrapWithProgress({ title: t("command.exportDiff.progress") }, async () => {
      const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "i18n-mage-diff-"));
      try {
        const baselineLangPath = path.join(tempRoot, ...relativeLangPath.split("/"));
        await materializeLangPathFromCommit(publicCtx.projectPath, commit.hash, relativeLangPath, tempRoot);
        if (!fs.existsSync(baselineLangPath)) {
          NotificationManager.showWarning(t("command.exportDiff.emptyBaseline"));
          return;
        }

        const baselineSnapshot = await withCurrentSnapshot(mage, baselineLangPath, () => takeSnapshot(mage));
        const allLangs = dedupeLangs(currentSnapshot, baselineSnapshot);
        const sourceLang = resolveSourceLang(publicCtx.referredLang, allLangs);
        const orderedLangs = orderLangsWithSourceFirst(allLangs, sourceLang);
        const records = buildDiffRecords(currentSnapshot, baselineSnapshot, allLangs);
        const workbook = buildWorkbook(records, orderedLangs, commit, sourceLang, repoMeta);
        fs.writeFileSync(fileUri.fsPath, workbook);

        NotificationManager.showSuccess(t("command.exportDiff.success", records.length));
      } finally {
        await fsp.rm(tempRoot, { recursive: true, force: true });
        await mage.execute({ task: "check", langPath: publicCtx.langPath });
      }
    });
  });

  registerDisposable(disposable);
}

async function withCurrentSnapshot<T>(mage: LangMage, langPath: string, task: () => Promise<T> | T): Promise<T> {
  await mage.execute({ task: "check", langPath });
  return await task();
}

function takeSnapshot(mage: LangMage): Snapshot {
  return {
    dictionary: JSON.parse(JSON.stringify(mage.langDetail.dictionary)) as LangDictionary,
    detectedLangList: [...mage.detectedLangList]
  };
}

function dedupeLangs(current: Snapshot, baseline: Snapshot): string[] {
  return Array.from(new Set([...current.detectedLangList, ...baseline.detectedLangList]));
}

function resolveSourceLang(referredLang: string, langs: string[]): string {
  return langs.includes(referredLang) ? referredLang : (langs[0] ?? "");
}

function buildDiffRecords(current: Snapshot, baseline: Snapshot, langs: string[]): DiffRecord[] {
  const keys = new Set([...Object.keys(current.dictionary), ...Object.keys(baseline.dictionary)]);
  const records: DiffRecord[] = [];

  for (const key of keys) {
    const hasNext = Object.hasOwn(current.dictionary, key);
    const hasPrev = Object.hasOwn(baseline.dictionary, key);
    const nextEntry = hasNext ? current.dictionary[key] : undefined;
    const prevEntry = hasPrev ? baseline.dictionary[key] : undefined;

    let action: DiffAction | null = null;
    if (hasPrev && !hasNext) {
      action = "DELETE";
    } else if (!hasPrev && hasNext) {
      action = "ADD";
    } else if (hasPrev && hasNext && prevEntry && nextEntry) {
      const changed = langs.some(lang => (prevEntry.value?.[lang] ?? "") !== (nextEntry.value?.[lang] ?? ""));
      if (changed) {
        action = "MODIFY";
      }
    }
    if (!action) {
      continue;
    }

    const oldValues: Record<string, string> = {};
    const newValues: Record<string, string> = {};
    for (const lang of langs) {
      oldValues[lang] = prevEntry?.value?.[lang] ?? "";
      newValues[lang] = nextEntry?.value?.[lang] ?? "";
    }

    records.push({
      action,
      key,
      changedLangs: langs.filter(lang => oldValues[lang] !== newValues[lang]),
      oldValues,
      newValues
    });
  }

  const actionOrder: Record<DiffAction, number> = { ADD: 1, MODIFY: 2, DELETE: 3 };
  records.sort((a, b) => actionOrder[a.action] - actionOrder[b.action] || a.key.localeCompare(b.key));
  return records;
}

function buildWorkbook(records: DiffRecord[], langs: string[], commit: CommitPick, sourceLang: string, repoMeta: RepoMeta) {
  const langColumns = buildLangColumns(langs);

  const addRows = records.filter(item => item.action === "ADD").map(item => [item.key, ...langs.map(lang => item.newValues[lang] ?? "")]);

  const modifyRows = records
    .filter(item => item.action === "MODIFY")
    .map(item => [
      item.key,
      item.changedLangs.map(lang => getLangText(lang, "en") || lang).join(", "),
      ...langs.flatMap(lang => {
        const oldValue = item.oldValues[lang] ?? "";
        const newValue = item.newValues[lang] ?? "";
        if (oldValue === newValue) {
          return ["", ""];
        }
        return [oldValue, newValue];
      })
    ]);

  const deleteRows = records
    .filter(item => item.action === "DELETE")
    .map(item => [item.key, ...langs.map(lang => item.oldValues[lang] ?? "")]);

  const addData = [["key", ...langColumns.map(item => item.title)], ...addRows];
  const modifyData = [
    ["key", "changed_languages", ...langColumns.flatMap(item => [`${item.title} (old)`, `${item.title} (new)`])],
    ...modifyRows
  ];
  const deleteData = [["key", ...langColumns.map(item => item.title)], ...deleteRows];

  const readmeData: Array<[string, string]> = [
    [t("command.exportDiff.readme.title"), t("command.exportDiff.readme.description")],
    [t("command.exportDiff.readme.project"), repoMeta.projectName],
    [t("command.exportDiff.readme.branch"), repoMeta.branchName],
    [
      t("command.exportDiff.readme.oldNode"),
      `${commit.hash.slice(0, 7)} (${commit.description ?? "-"}) ${commit.label.replace(/^[0-9a-f]{7}\s+/i, "")}`
    ],
    [
      t("command.exportDiff.readme.newNode"),
      `${repoMeta.headShort} (${repoMeta.headDate}) ${repoMeta.headSubject}${repoMeta.dirty ? ` ${t("command.exportDiff.readme.withWorkingChanges")}` : ""}`
    ],
    [t("command.exportDiff.readme.baseline"), commit.description ?? commit.label],
    [t("command.exportDiff.readme.sourceLang"), getLangText(sourceLang, "en") || sourceLang],
    [t("command.exportDiff.readme.flow"), t("command.exportDiff.readme.flowDesc")],
    [t("command.exportDiff.readme.rule1"), t("command.exportDiff.readme.rule1Desc")],
    [t("command.exportDiff.readme.rule2"), t("command.exportDiff.readme.rule2Desc")],
    [t("command.exportDiff.readme.rule3"), t("command.exportDiff.readme.rule3Desc")],
    [t("command.exportDiff.readme.modifyHint"), t("command.exportDiff.readme.modifyHintDesc")],
    [t("command.exportDiff.readme.importHint"), t("command.exportDiff.readme.importHintDesc")]
  ];

  const sheetOptions = {
    "!cols": [{ wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 30 }, ...Array.from({ length: langs.length * 2 }, () => ({ wch: 36 }))]
  };

  return xlsx.build(
    [
      { name: "README", data: readmeData, options: {} },
      { name: "ADD", data: addData, options: {} },
      { name: "MODIFY", data: modifyData, options: {} },
      { name: "DELETE", data: deleteData, options: {} }
    ],
    { sheetOptions }
  );
}

function buildLangColumns(langs: string[]) {
  const used = new Map<string, number>();
  return langs.map(lang => {
    const baseTitle = getLangText(lang, "en") || lang;
    const count = used.get(baseTitle) ?? 0;
    used.set(baseTitle, count + 1);
    const title = count === 0 ? baseTitle : `${baseTitle} (${lang})`;
    return { lang, title };
  });
}

function orderLangsWithSourceFirst(langs: string[], sourceLang: string) {
  if (!langs.includes(sourceLang)) {
    return [...langs];
  }
  return [sourceLang, ...langs.filter(lang => lang !== sourceLang)];
}

async function pickBaselineCommit(projectPath: string, relativeLangPath: string): Promise<CommitPick | null> {
  let commits: CommitPick[] = [];
  try {
    commits = getCommitOptions(projectPath, relativeLangPath);
    if (commits.length === 0) {
      commits = getCommitOptions(projectPath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    NotificationManager.showError(message);
    return null;
  }
  if (commits.length === 0) {
    NotificationManager.showWarning(t("command.exportDiff.noCommits"));
    return null;
  }

  return (await vscode.window.showQuickPick(commits, {
    placeHolder: t("command.exportDiff.selectBaselineCommit")
  })) as CommitPick | null;
}

function getCommitOptions(projectPath: string, relativeLangPath = ""): CommitPick[] {
  const args = ["-C", projectPath, "log", `--max-count=${MAX_COMMIT_OPTIONS}`, "--date=short", "--pretty=format:%H%x09%h%x09%cs%x09%s"];
  if (relativeLangPath) {
    args.push("--", relativeLangPath);
  }
  const output = runGit(args);
  if (!output) {
    return [];
  }
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [hash, shortHash, date, subject] = line.split("\t");
      return {
        hash,
        label: `${shortHash} ${subject}`,
        description: date,
        detail: hash
      };
    });
}

async function materializeLangPathFromCommit(projectPath: string, hash: string, relativeLangPath: string, targetRoot: string) {
  const filesOutput = runGit(["-C", projectPath, "ls-tree", "-r", "--name-only", hash, "--", relativeLangPath]);
  const files = filesOutput
    .split(/\r?\n/)
    .map(item => item.trim())
    .filter(Boolean);
  for (const file of files) {
    const content = runGitBuffer(["-C", projectPath, "show", `${hash}:${file}`]);
    const targetFile = path.join(targetRoot, ...file.split("/"));
    await fsp.mkdir(path.dirname(targetFile), { recursive: true });
    await fsp.writeFile(targetFile, content);
  }
}

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(t("command.exportDiff.gitError", message));
  }
}

function runGitBuffer(args: string[]): Buffer {
  try {
    return execFileSync("git", args, {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 16
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(t("command.exportDiff.gitError", message));
  }
}

function normalizeGitPath(filePath: string): string {
  return filePath.split(path.sep).join("/").replace(/^\.\//, "");
}

function getRepoMeta(projectPath: string): RepoMeta {
  const projectName = getProjectName(projectPath);
  try {
    const branchName = runGit(["-C", projectPath, "rev-parse", "--abbrev-ref", "HEAD"]).trim() || "-";
    const headRaw = runGit(["-C", projectPath, "log", "-1", "--date=short", "--pretty=format:%H%x09%h%x09%cs%x09%s"]).trim();
    const [headHash = "-", headShort = "-", headDate = "-", headSubject = "-"] = headRaw.split("\t");
    const dirty = runGit(["-C", projectPath, "status", "--porcelain"]).trim().length > 0;
    return { projectName, branchName, headShort, headHash, headDate, headSubject, dirty };
  } catch {
    return {
      projectName,
      branchName: "-",
      headShort: "-",
      headHash: "-",
      headDate: "-",
      headSubject: "-",
      dirty: false
    };
  }
}

function getProjectName(targetPath: string) {
  const raw = path.basename(targetPath || "").trim() || "project";
  return raw.replace(/[<>:"/\\|?*\s]+/g, "-");
}

function formatDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}
