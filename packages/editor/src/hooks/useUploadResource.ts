import { useSlateStatic } from "slate-react";
import { IResourceService } from "../services";

export const useUploadResource = () => {
  const editor = useSlateStatic();
  return editor.getService(IResourceService).upload;
};

export default useUploadResource;
