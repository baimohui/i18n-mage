import { useMemo } from "preact/hooks";
import { t as translate } from "./utils";

export function useTranslation() {
  const t = useMemo(() => {
    return (key: string, ...args: unknown[]) => {
      return translate(key, ...args);
    };
  }, []);

  return { t };
}
