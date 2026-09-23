import { createContext, useContext } from "react";

export const ProjectContext = createContext<{
  projectId: number;
  itemId?: number;
  containerWidth?: number;
}>({
  projectId: 0,
  itemId: undefined,
  containerWidth: undefined,
});

export const useProjectContext = () => {
  return useContext(ProjectContext);
};

export default ProjectContext;
