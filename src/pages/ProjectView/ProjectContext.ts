import { createContext, useContext } from "react";

export const ProjectContext = createContext<{
  projectId: number;
}>({
  projectId: 0,
});

export const useProjectContext = () => {
  return useContext(ProjectContext);
};

export default ProjectContext;
