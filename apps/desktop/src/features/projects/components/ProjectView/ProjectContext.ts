import { createContext, useContext } from "react";

export interface ProjectDocumentAction {
  itemId: number;
  type: "immersive" | "collaboration";
}

export const ProjectContext = createContext<{
  projectId: number;
  itemId?: number;
  containerWidth?: number;
  documentAction?: ProjectDocumentAction | null;
  requestDocumentAction?: (action: ProjectDocumentAction) => void;
  clearDocumentAction?: () => void;
}>({
  projectId: 0,
  itemId: undefined,
  containerWidth: undefined,
});

export const useProjectContext = () => {
  return useContext(ProjectContext);
};

export default ProjectContext;
