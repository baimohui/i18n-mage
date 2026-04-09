import * as assert from "assert";
import path from "path";
import { isPathInsideDirectory, isSamePath, toAbsolutePath, toRelativePath } from "@/utils/fs";
import { setActiveEditor, setWorkspaceRoots } from "../../helpers/vscodeMock";

describe("utils/fs", () => {
  const workspaceA = path.join(__dirname, "..", "..", "fixtures", "workspace-a");
  const workspaceB = path.join(__dirname, "..", "..", "fixtures", "workspace-b");

  beforeEach(() => {
    setWorkspaceRoots([workspaceA, workspaceB]);
    setActiveEditor("", 1, path.join(workspaceB, "src", "index.ts"));
  });

  it("toAbsolutePath 应基于当前活动工作区解析相对路径", () => {
    const target = toAbsolutePath("src/i18n");
    assert.strictEqual(target, path.resolve(workspaceB, "src", "i18n"));
  });

  it("toRelativePath 应基于目标文件所属工作区计算路径", () => {
    const fileInA = path.join(workspaceA, "src", "app.ts");
    const fileInB = path.join(workspaceB, "src", "main.ts");
    assert.strictEqual(toRelativePath(fileInA), "src/app.ts");
    assert.strictEqual(toRelativePath(fileInB), "src/main.ts");
  });

  it("相对路径比较应跟随当前工作区", () => {
    const absoluteInB = path.join(workspaceB, "src", "i18n");
    assert.strictEqual(isSamePath("src/i18n", absoluteInB), true);
    assert.strictEqual(isPathInsideDirectory("src", path.join(workspaceB, "src", "index.ts")), true);
    assert.strictEqual(isPathInsideDirectory(path.join(workspaceB, "src"), path.join(workspaceA, "src", "index.ts")), false);
  });
});
