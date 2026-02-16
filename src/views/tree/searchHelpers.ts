import { EntryTree } from "@/types";
import { unescapeString } from "@/utils/regex";

interface MatchesSearchParams {
  key: string;
  isSearching: boolean;
  isCaseSensitive: boolean;
  isWholeWordMatch: boolean;
  filterText: string;
  dictionary: Record<string, { value: Record<string, string> }>;
}

export function wholeWordMatch(text: string, searchTerm: string, isCaseSensitive: boolean): boolean {
  if (!searchTerm || !text) {
    return false;
  }
  const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `(?:^|[^\\w\\u4e00-\\u9fff])(${escapedSearchTerm})(?:$|[^\\w\\u4e00-\\u9fff])`;

  try {
    const regex = new RegExp(pattern, isCaseSensitive ? "" : "i");
    return regex.test(text);
  } catch {
    return text.includes(searchTerm);
  }
}

export function matchesSearch(params: MatchesSearchParams): boolean {
  const { key, isSearching, isCaseSensitive, isWholeWordMatch, filterText, dictionary } = params;
  if (!isSearching) return true;

  const name = unescapeString(key);
  const filter = isCaseSensitive ? filterText : filterText.toLowerCase();
  const entryInfo = dictionary[key]?.value ?? {};

  const matchesName = isWholeWordMatch
    ? new RegExp(`\\b${filter}\\b`, isCaseSensitive ? "" : "i").test(name)
    : (isCaseSensitive ? name : name.toLowerCase()).includes(filter);

  const matchesValue = Object.values(entryInfo).some(value =>
    isWholeWordMatch
      ? wholeWordMatch(isCaseSensitive ? value : value.toLowerCase(), filter, isCaseSensitive)
      : (isCaseSensitive ? value : value.toLowerCase()).includes(filter)
  );

  return matchesName || matchesValue;
}

export function getFilteredDictionaryTreeNode(
  node: string | EntryTree | string[],
  isMatch: (key: string) => boolean
): string | EntryTree | null {
  if (typeof node === "string") {
    return isMatch(node) ? node : null;
  }
  if (Array.isArray(node)) {
    return null;
  }

  const filteredEntries = Object.entries(node)
    .map(([key, value]) => [key, getFilteredDictionaryTreeNode(value, isMatch)] as const)
    .filter(([, value]) => value !== null);

  if (filteredEntries.length === 0) {
    return null;
  }
  return Object.fromEntries(filteredEntries) as EntryTree;
}

export function countDictionaryLeaves(node: string | EntryTree | string[] | null): number {
  if (node === null) return 0;
  if (typeof node === "string") return 1;
  if (Array.isArray(node)) return 0;
  return Object.values(node).reduce((acc, value) => acc + countDictionaryLeaves(value), 0);
}
