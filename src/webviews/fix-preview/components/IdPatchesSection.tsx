import { FixedTEntry } from "@/types";
import { FileGroup } from "./FileGroup";

interface Props {
  data: {
    idPatches: Record<string, FixedTEntry[]>;
  };
}

export function IdPatchesSection({ data }: Props) {
  const { idPatches } = data;

  if (!Object.keys(idPatches).length) return null;

  return (
    <div className="section id-patches">
      <h2>术语 ID 修复</h2>
      {Object.entries(idPatches).map(([file, changes], fileIndex) => (
        <FileGroup key={file} file={file} fileIndex={fileIndex} changes={changes} />
      ))}
    </div>
  );
}
