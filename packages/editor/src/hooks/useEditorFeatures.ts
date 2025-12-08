import { useContext } from "react";
import { EditorContext, EditorFeatures } from "../index.tsx";

/**
 * Hook to access editor features configuration
 * Returns the features object from EditorContext
 */
const useEditorFeatures = (): EditorFeatures => {
  const context = useContext(EditorContext);
  return context.features ?? {};
};

export default useEditorFeatures;
