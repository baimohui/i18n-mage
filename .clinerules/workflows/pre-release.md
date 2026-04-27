# Pre-release Workflow

发版前的准备工作流，按以下步骤顺序执行。

> **前置条件**：已确认要发布的新版本号（例如 `1.3.7`）。
> **注意**：在 ACT MODE 下执行此工作流，每个步骤完成后请等待用户确认再继续下一步。

---

## Step 1: 更新 package.json 版本号

1. 读取 `package.json`，将 `"version"` 字段更新为目标版本号（例如 `"1.3.7"`）
2. 同时读取 `package-lock.json`，更新其中的 `"version"` 字段以保持一致

## Step 2: 获取上一个版本标签及 commit 日志

1. 获取最新的 git tag（上一个版本号）：
   ```bash
   git tag --sort=-v:refname | head -1
   ```
   输出如 `v1.3.6`，记下这个 tag（即 `LAST_TAG`）。

2. 获取从上个 tag 到当前 HEAD 的所有 commit（含上个 tag 之后的第一个 commit，因为是 `release: v1.3.6` 是上次发版 commit）：
   ```bash
   git log --oneline <LAST_TAG>..HEAD
   ```
   例如：`git log --oneline v1.3.6..HEAD`

3. 同时获取上个 release commit 的完整信息，以了解上一个版本内容：
   ```bash
   git log -1 --format="%H" <LAST_TAG>
   ```

## Step 3: 生成并插入 CHANGELOG.md

### 3.1 分析 commits

分析从上个 tag 以来的所有 commits，过滤出对用户有感知的变更。按以下规则分类：

| Commit 类型 | CHANGELOG 分类 | 说明 |
|------------|----------------|------|
| `feat:` | `### Added` | 新功能 |
| `fix:` | `### Fixed` | Bug 修复 |
| `refactor:` | `### Improved` | 重构但用户可感知的改进（如 UI 变化、性能优化等） |
| `docs:` | `### Documentation` | 文档变更 |
| `perf:` | `### Improved` | 性能优化 |
| `test:` | 忽略（除非影响用户感知） | 测试变更通常不写入 |
| `chore:` | 忽略 | 杂项变更通常不写入 |
| `build(deps):` | 忽略 | 依赖更新不写入 |
| `Merge pull request` | 忽略 | 合并提交不直接写入 |
| `release:` | 忽略 | 发版提交不写入 |

**过滤规则**：
- 排除以 `chore:`、`build(deps):`、`Merge`、`release:` 开头的 commit
- `test:` 开头的 commit 通常排除，但如果是新增了重要的测试基础设施则纳入 `### Improved`
- 对于 `refactor:` 类型的 commit，需判断是否为用户可感知的变化（UI 变化、性能提升等），如果是则纳入 `### Improved`

### 3.2 生成 CHANGELOG 内容

按照以下格式生成新版本的 CHANGELOG 区块：

```markdown
## [X.X.X] - YYYY-MM-DD

### Added
- **Feature Title**: Feature description.

### Fixed
- **Bug Title**: Bug fix description.

### Improved
- **Improvement Title**: Improvement description.

### Documentation
- **Doc Title**: Documentation change description.
```

#### 内容生成规则

- **日期格式**：使用 `YYYY-MM-DD` 格式（例如 `2026-04-27`）
- **标题转换**：将 commit message 从英文转换为可读的描述性文字，提取关键信息
  - 例如 `feat: add multi-workspace support and path resolution` → **Multi-workspace Support**: Added full support for multi-workspace mode with path resolution.
  - 例如 `fix: enhance AI prefix candidate handling and validation logic` → **AI Prefix Candidate Handling**: Enhanced validation and handling logic for AI prefix candidates.
- **合并同类项**：多个相同类型的 commit 合并到同一分类下
- **按重要性排序**：每个分类下的条目按重要性从高到低排列
- **从 CHANGELOG 历史中保持风格一致**：参考已存在的 CHANGELOG.md 格式风格

### 3.3 插入到 CHANGELOG.md

将生成的新版本区块插入到 `CHANGELOG.md` 中：

1. 查找 `# Changelog` 标题和 `All notable changes...` 段落
2. 在此段落之后、第一个现有版本区块之前插入新版本区块
3. 确保前后各有一个空行

## Step 4: 更新 Locale 翻译文件

### 4.1 查找所有 locale 文件

```bash
dir src\locales\*.json /b
```
或列出 `src/locales/` 目录下的所有 `.json` 文件。

### 4.2 对每个 locale 文件执行以下操作

#### 4.2.1 删除旧版本的 updateSummary 词条

1. 在文件中搜索 `"updateSummary.version.` 后跟版本号的词条
2. 删除该词条所在的整行（包括其尾部的逗号）
3. 注意处理删除后可能产生的前一行尾部多余逗号问题

例如删除：
```json
  "updateSummary.version.1_3_6": "...",
```
删除后要检查前一行末尾是否有多余的逗号，如有则去掉。

> **注意**：由于 JSON 是非标准格式（带有注释等），使用 `replace_in_file` 进行精确匹配删除。

#### 4.2.2 添加新版本的 updateSummary 词条

1. 在 `updateSummary` 相关词条组的最后（在 `"updateSummary.actions.viewChangelog"` 行之后，通常紧跟该条或再后一条），插入新词条
2. 新词条 key 格式：`updateSummary.version.X_X_X`（其中 `X_X_X` 为版本号，点号替换为下划线，如 `1_3_7`）
3. 新词条内容要求：
   - **不支持 Markdown 语法**，使用纯文本
   - 换行使用 `\n` 转义符
   - 分类使用 `【新增】`(zh-CN) / `[Added]`(en)、`【修复】`(zh-CN) / `[Fixed]`(en)、`【优化】`(zh-CN) / `[Improved]`(en) 等
   - 内容简洁易懂，让用户快速了解变更
   - 对 en.json 使用英文描述，zh-CN.json 使用中文描述

#### Locale 词条内容生成规则

根据 Step 3 分析的 commits，为每个 locale 生成对应的简洁 updateSummary 内容：

**en.json 示例格式**：
```json
"updateSummary.version.1_3_7": "[Added]\n1. Multi-workspace support.\n2. Quick search navigation with keyboard shortcuts.\n\n[Fixed]\n1. Deduplication issue in search navigation locations.\n\n[Improved]\n1. Debounced search for better performance.\n2. Enhanced QuickPick focus behavior.",
```

**zh-CN.json 示例格式**：
```json
"updateSummary.version.1_3_7": "【新增】\n1. 支持多工作区模式。\n2. 搜索快速跳转功能，支持键盘快捷键。\n\n【修复】\n1. 修复搜索跳转位置去重问题。\n\n【优化】\n1. 搜索加入防抖处理，提升性能。\n2. 优化 QuickPick 焦点行为。",
```

> **注意**：`updateSummary` 词条与 CHANGELOG 的区别：
> - CHANGELOG 使用 Markdown 格式、详细描述、有标题和链接
> - updateSummary 使用纯文本（`\n` 换行）、更简洁、便于弹窗快速阅读

### 4.3 词条插入位置规则

插入时，在 `"updateSummary.actions.viewChangelog"` 行之后插入，确保 JSON 语法正确（前一行末尾有逗号则新行可以不加末尾逗号，或者统一处理逗号）。示例如下：

当前 en.json 中 `updateSummary` 相关区域的最后几行：
```json
  "updateSummary.actions.disable": "Don't show again",
  "updateSummary.actions.enable": "Re-enable update notifications",
  "updateSummary.actions.viewChangelog": "View full changelog",
  "updateSummary.title": "i18n Mage updated to v{0}",
  "updateSummary.version.1_3_6": "...",
  "tree.search.caseSensitiveMatching": "...",
```

删除 `updateSummary.version.1_3_6` 后，在 `updateSummary.title` 行之后插入新版本词条（注意逗号处理）：

```json
  "updateSummary.actions.disable": "Don't show again",
  "updateSummary.actions.enable": "Re-enable update notifications",
  "updateSummary.actions.viewChangelog": "View full changelog",
  "updateSummary.title": "i18n Mage updated to v{0}",
  "updateSummary.version.1_3_7": "...",
  "tree.search.caseSensitiveMatching": "...",
```

## Step 5: Git 提交与打 Tag

完成以上所有文件修改后：

1. 暂存所有变更：
   ```bash
   git add -A
   ```

2. 提交发版 commit：
   ```bash
   git commit -m "release: vX.X.X"
   ```
   （将 `X.X.X` 替换为实际版本号）

3. 打 git tag：
   ```bash
   git tag vX.X.X
   ```
   （将 `X.X.X` 替换为实际版本号）

## Step 6: 代码质量检查

根据 `.clinerules/code-quality-check.md` 规则，运行检查：

```bash
npm run check
```

确保无 error 级别错误。如有错误则修复后重新运行检查，直到通过。

---

## 工作流完成检查清单

- [ ] Step 1: package.json 版本号已更新
- [ ] Step 2: 已获取上一个 tag 及 commit 日志
- [ ] Step 3: CHANGELOG.md 已更新
- [ ] Step 4: 所有 locale 文件已更新（删除旧词条、添加新词条）
- [ ] Step 5: Git 已提交并打 tag（`release: vX.X.X`）
- [ ] Step 6: `npm run check` 通过

---

## 交互说明

- 在每个 Step 开始前，向用户说明当前步骤并等待确认
- 在 Step 3 的 commit 分析和 CHANGELOG 内容生成后，**先展示给用户确认**再写入文件
- 在 Step 4 的 locale 内容生成后，**先展示给用户确认**再写入文件
- 如果用户对生成的内容不满意，按用户要求进行调整
