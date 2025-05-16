import { useContext } from "react";
import { EditorContext } from "@editor/index.tsx";

/**
 * 从编辑器上下文中获取uploadResource函数的Hook
 */
export const useUploadResource = () => {
  const { uploadResource } = useContext(EditorContext) || {};
  return uploadResource;
};

export default useUploadResource;
