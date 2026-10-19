import { IResourceService } from "@tau/shared/host-services";
import { useSlateStatic } from "slate-react";

export const useUploadResource = () => {
  const editor = useSlateStatic();
  return editor.getService(IResourceService).upload;
};

export default useUploadResource;
