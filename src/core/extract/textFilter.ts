function isRegexLikeFragment(text: string) {
  if (text.trim().length === 0) return false;
  if (!text.includes("\\")) return false;
  if (/\s/.test(text) && !/\\s/.test(text)) return false;
  const regexTokenPattern = /\\[dDsSwWbB]|[()[\]{}+*?|^$]/;
  if (!regexTokenPattern.test(text)) return false;
  // Avoid blocking normal prose that happens to include one escaped slash.
  const alphaCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return alphaCount <= 6;
}

function isCodeLikeSnippet(text: string) {
  const trimmed = text.trim();
  if (trimmed.length <= 1) return true;
  if ([...trimmed].every(char => "()[]{}<>;,:|&^~`".includes(char))) return true;
  if (/^(?:=>|==?=?|!=?=?|&&|\|\||\+\+|--)$/.test(trimmed)) return true;
  if (/^(?:import|export|function|return|const|let|var)\b/.test(trimmed)) return true;
  if (/^['"`].*['"`]$/.test(trimmed)) return true;
  if (/^[\w$]+\([^)]*\)$/.test(trimmed) && !/\s/.test(trimmed)) return true;
  return false;
}

export function isInvalidHardcodedText(text: string) {
  // URLs / file globs / tags / css-like values / numeric literals are not user-facing i18n text.
  // CLI args/options are not translatable copy, e.g. "--date=short", "-f", "--pretty=format:%H".
  if (/^-{1,2}[A-Za-z0-9][\w-]*(?:=[^\s]+)?$/.test(text)) return true;
  if (/^(?:https?:)?\/\/\S+$/i.test(text)) return true;
  if (/^(?:mailto:|tel:|data:)\S+$/i.test(text)) return true;
  if (/^(?:\w+:\/\/)?[\w.-]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(text)) return true;
  if (/^[A-Za-z]:\\/.test(text)) return true;
  if (/^(?:\.{0,2}[/\\]|[/\\]).+/.test(text) && !/\s/.test(text)) return true;
  if (/^[./@_\w-]+$/.test(text)) return true;
  if (/^[A-Z_][A-Z0-9_]{2,}$/.test(text)) return true;
  if (/^--?[a-z][\w-]*$/i.test(text)) return true;
  if (/^\$\{?[\w.]+\}?$/.test(text)) return true;
  if (/^\{+[\w.$-]+\}+$/.test(text)) return true;
  if (/^(?:https?:)?\/\/\S+$/i.test(text)) return true;
  if (/^<\/?[a-z][^>]*>$/i.test(text)) return true;
  if (/^<!DOCTYPE\s+html>$/i.test(text)) return true;
  if (/^&[a-zA-Z]+;$/.test(text)) return true;
  if (/^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/.test(text)) return true;
  if (/^(?:rgb|rgba|hsl|hsla)\s*\([^)]*\)$/i.test(text)) return true;
  if (/^var\(--[\w-]+\)$/i.test(text)) return true;
  if (/^-?\d+(?:\.\d+)?(?:px|r?em|vh|vw|vmin|vmax|%)$/i.test(text)) return true;
  if (/^\d+(?:\.\d+)?$/.test(text)) return true;
  if (/^\$[A-Za-z_][$\w]*$/.test(text)) return true;
  if (/^\[object\s+[A-Za-z][\w$]*\]$/i.test(text)) return true;
  if (/^(?:undefined|null|true|false|NaN|Infinity)$/i.test(text)) return true;
  if (/^<[/!?]?(?:script|style|template)\b/i.test(text)) return true;
  if (/^\*?\.[a-z0-9]+$/i.test(text)) return true;
  if (/^\*+\.[\w.-]+$/.test(text)) return true;
  if (/^[-\w]+(?:\.[-\w]+)+$/.test(text) && !/\s/.test(text) && !/[A-Z]/.test(text)) return true;
  // printf/date/strftime-like format fragments, e.g. "%H%x09%cs%x09%s"
  if (/(?:%[A-Za-z]|%x[\da-fA-F]{2})/.test(text) && (text.match(/%/g) ?? []).length >= 2 && !/\s/.test(text)) {
    return true;
  }

  // Escaped control/unicode sequences such as "\\n", "\\u003c", "\\x3C".
  if (/^(?:\\[nrtbfv0'"\\])+$/i.test(text)) return true;
  if (/^\\(?:n|r|t|b|f|v|0)$/.test(text)) return true;
  if (/^\\u[\da-fA-F]{4}$/i.test(text)) return true;
  if (/^\\u\{[\da-fA-F]{1,6}\}$/i.test(text)) return true;
  if (/^\\x[\da-fA-F]{2}$/i.test(text)) return true;

  // File masks such as "*.json".
  if (/[*?]/.test(text) && /^[*?[\]{}!./\\\w-]+$/.test(text)) return true;

  // Regex-source-like fragments such as "\\s*[\\{\\[]", "\\.\\d+".
  if (isRegexLikeFragment(text)) return true;
  if (isCodeLikeSnippet(text)) return true;
  return false;
}
