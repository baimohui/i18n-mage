import { EntryTree } from "@/types";
import { ActiveEditorState, DefinedEntryInEditor } from "@/utils/activeEditorState";
import { resolveEntryKeyFromName } from "@/utils/regex";

export function getDefinedEntriesWithDynamicMatches(entryTree: EntryTree): DefinedEntryInEditor[] {
  const definedEntriesInCurrentFile: DefinedEntryInEditor[] = [];
  const definedEntries = Array.from(ActiveEditorState.definedEntries.values()).map(item => item[0]);

  for (const entry of definedEntries) {
    if (entry.dynamic) {
      const matchedNames = ActiveEditorState.dynamicMatchInfo.get(entry.nameInfo.name) || [];
      matchedNames.forEach(name => {
        if (!definedEntriesInCurrentFile.find(item => item.nameInfo.name === name)) {
          const newEntry: DefinedEntryInEditor = {
            ...entry,
            nameInfo: { ...entry.nameInfo, text: name, name: name, key: resolveEntryKeyFromName(entryTree, name) ?? "" }
          };
          definedEntriesInCurrentFile.push(newEntry);
        }
      });
    } else {
      definedEntriesInCurrentFile.push(entry);
    }
  }

  return definedEntriesInCurrentFile;
}
