import { registerCheckUsageCommand } from "./check/checkUsageCommand";
import { registerMarkAsKnownLangCommand } from "./check/markAsKnownLangCommand";
import { registerSetReferredLangCommand } from "./check/setReferredLangCommand";
import { registerMarkAsUsedCommand } from "./check/markAsUsedCommand";
import { registerCopyKeyValueCommand } from "./copy/copyKeyValueCommand";
import { registerCopyNameCommand } from "./copy/copyNameCommand";
import { registerCopyValueCommand } from "./copy/copyValueCommand";
import { registerDeleteUnusedCommand } from "./fix/deleteUnusedCommand";
import { registerEditValueCommand } from "./fix/editValueCommand";
import { registerFixCommand } from "./fix/fixCommand";
import { registerSortCommand } from "./fix/sortCommand";
import { registerExportCommand } from "./importExport/exportCommand";
import { registerImportCommand } from "./importExport/importCommand";
import { registerGoToDefinitionCommand } from "./tree/goToDefinitionCommand";
import { registerGoToReferenceCommand } from "./tree/goToReferenceCommand";
import { registerIgnoreFileCommand } from "./tree/ignoreFileCommand";

export function registerAllCommands() {
  registerCheckUsageCommand();
  registerMarkAsKnownLangCommand();
  registerSetReferredLangCommand();
  registerMarkAsUsedCommand();
  registerCopyKeyValueCommand();
  registerCopyNameCommand();
  registerCopyValueCommand();
  registerDeleteUnusedCommand();
  registerEditValueCommand();
  registerFixCommand();
  registerSortCommand();
  registerExportCommand();
  registerImportCommand();
  registerGoToDefinitionCommand();
  registerGoToReferenceCommand();
  registerIgnoreFileCommand();
}
