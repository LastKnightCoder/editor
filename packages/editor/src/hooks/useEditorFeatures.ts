import { useContext } from "react";
import { EditorContext, type EditorFeatures } from "../contexts/EditorContext";

const EMPTY_EDITOR_FEATURES: EditorFeatures = {};

/**
 * Hook to access editor features configuration
 * Returns the features object from EditorContext
 */
const useEditorFeatures = (): EditorFeatures => {
  const context = useContext(EditorContext);
  return context.features ?? EMPTY_EDITOR_FEATURES;
};

export default useEditorFeatures;
