/**
 * 根据文档文本，裁剪掉选中范围的外层引号（如有）
 * @param text 文档全文
 * @param startOffset 起始偏移（含引号）
 * @param endOffset 结束偏移（含引号）
 * @returns 裁剪后的 [startOffset, endOffset]（不含引号）
 */
export function stripQuotesFromRange(text: string, startOffset: number, endOffset: number): [number, number] {
  const start = text[startOffset] === '"' || text[startOffset] === "'" || text[startOffset] === "`" ? startOffset + 1 : startOffset;
  const end = text[endOffset - 1] === '"' || text[endOffset - 1] === "'" || text[endOffset - 1] === "`" ? endOffset - 1 : endOffset;
  return [start, end];
}
