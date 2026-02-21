type NodeXlsx = (typeof import("node-xlsx"))["default"];

let nodeXlsxPromise: Promise<NodeXlsx> | null = null;

export async function loadNodeXlsx(): Promise<NodeXlsx> {
  if (!nodeXlsxPromise) {
    nodeXlsxPromise = import("node-xlsx").then(mod => mod.default);
  }
  return await nodeXlsxPromise;
}
