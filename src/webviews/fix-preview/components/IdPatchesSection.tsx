import { FixedTEntry } from "@/types";
import { FileGroup } from "./FileGroup";
import { useTranslation } from "@/webviews/shared/hooks";

interface Props {
  data: {
    idPatches: Record<string, FixedTEntry[]>;
  };
}

export function IdPatchesSection({ data }: Props) {
  const { idPatches } = data;
  const { t } = useTranslation();

  if (!Object.keys(idPatches).length) return null;

  return (
    <div className="section id-patches">
      <h2>{t("preview.termIdPatch")}</h2>
      {Object.entries(idPatches).map(([file, changes], fileIndex) => (
        <FileGroup key={file} file={file} fileIndex={fileIndex} changes={changes} />
      ))}
    </div>
  );
}
