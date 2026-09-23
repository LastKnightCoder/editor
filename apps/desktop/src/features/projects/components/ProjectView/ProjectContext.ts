import { createContext, useContext } from "react";

export const ProjectContext = createContext<{
  projectId: number;
  itemId?: number;
  containerWidth?: number;
  /** 选中条目上收：树节点点击（高频）走本地状态，不经页面栈 */
  setActiveItemId?: (itemId: number | undefined) => void;
}>({
  projectId: 0,
  itemId: undefined,
  containerWidth: undefined,
});

export const useProjectContext = () => {
  return useContext(ProjectContext);
};

export default ProjectContext;
