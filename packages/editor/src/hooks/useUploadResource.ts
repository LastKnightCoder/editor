import { useSlateStatic } from "slate-react";
import type { IResource } from "../types";

export const useUploadResource = () => {
  const editor = useSlateStatic();
  const serviceUpload = editor.services?.resource.upload;

  const normalizeResult = (result: string | IResource | undefined) => {
    if (!result) return undefined;
    return typeof result === "string" ? result : result.url ?? undefined;
  };

  if (serviceUpload) {
    return async (file: File): Promise<string | undefined> => {
      const result = await serviceUpload(file);
      return normalizeResult(result);
    };
  }

  return undefined;
};

export default useUploadResource;
