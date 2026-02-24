/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const exts = [".ts", ".tsx", ".js", ".jsx"];

function normalize(p: string) {
  return p.replace(/\\/g, "/");
}

function walk(dir: string): string[] {
  const result: string[] = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      result.push(...walk(fullPath));
    } else if (exts.includes(path.extname(dirent.name)) && !dirent.name.endsWith(".d.ts")) {
      result.push(fullPath);
    }
  }
  return result;
}

function resolveImport(fromFile: string, spec: string, byNoExt: Map<string, string>): string | null {
  if (typeof spec !== "string" || spec.length === 0) return null;
  let basePath = "";
  if (spec.startsWith("@/")) {
    basePath = path.join(srcRoot, spec.slice(2));
  } else if (spec.startsWith("@utils/")) {
    basePath = path.join(srcRoot, "utils", spec.slice("@utils/".length));
  } else if (spec.startsWith(".")) {
    basePath = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null;
  }

  const candidates = [basePath];
  for (const ext of exts) candidates.push(`${basePath}${ext}`);
  for (const ext of exts) candidates.push(path.join(basePath, `index${ext}`));

  for (const item of candidates) {
    if (byNoExt.has(item)) return byNoExt.get(item)!;
    if (fs.existsSync(item) && fs.statSync(item).isFile() && exts.includes(path.extname(item))) {
      return item;
    }
  }
  return null;
}

function getEntryFiles() {
  const entries = [
    path.join(srcRoot, "extension.ts"),
    path.join(srcRoot, "webviews", "fix-preview", "main.tsx"),
    path.join(srcRoot, "webviews", "extract-setup", "main.tsx"),
    path.join(srcRoot, "webviews", "extract-scan-confirm", "main.tsx")
  ];
  return entries.filter(file => fs.existsSync(file));
}

function buildGraph(files: string[], byNoExt: Map<string, string>) {
  const graph = new Map<string, Set<string>>();
  const importRegex = /(?:import\s+(?:[^'"()]*?\s+from\s+)?|export\s+[^'"()]*?\s+from\s+|require\s*\(|import\s*\()\s*['"]([^'"]+)['"]/g;
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const deps = new Set<string>();
    let match: RegExpExecArray | null = null;
    while ((match = importRegex.exec(content)) !== null) {
      const target = resolveImport(file, match[1], byNoExt);
      if (target != null) deps.add(target);
    }
    graph.set(file, deps);
  }
  return graph;
}

function markReachable(graph: Map<string, Set<string>>, entries: string[]) {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const file = stack.pop();
    if (file == null || seen.has(file)) continue;
    seen.add(file);
    const deps = graph.get(file);
    if (!deps) continue;
    for (const dep of deps) {
      if (!seen.has(dep)) stack.push(dep);
    }
  }
  return seen;
}

function main() {
  if (!fs.existsSync(srcRoot)) {
    console.log("No src directory found.");
    process.exit(0);
  }

  const files = walk(srcRoot);
  const byNoExt = new Map(files.map(file => [file.slice(0, -path.extname(file).length), file]));
  const entries = getEntryFiles();

  if (entries.length === 0) {
    console.log("No entry files found. Skipping dead file check.");
    process.exit(0);
  }

  const graph = buildGraph(files, byNoExt);
  const reachable = markReachable(graph, entries);
  const deadFiles = files.filter(file => !reachable.has(file)).sort();

  if (deadFiles.length === 0) {
    console.log("No dead source files found.");
    process.exit(0);
  }

  console.log(`Dead source files (${deadFiles.length}):`);
  for (const file of deadFiles) {
    console.log(`- ${normalize(path.relative(root, file))}`);
  }
  process.exit(1);
}

main();
