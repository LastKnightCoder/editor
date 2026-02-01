import { useEffect } from "react";
import toolRegistry from "@/tools";
import {
  createVibeLearningSearchTool,
  createListResourcesTool,
  createReadResourceContentTool,
  createReadResourceRangeTool,
} from "@/tools/vibeLearningSearchTool";

export const useVibeLearningChat = (projectId: number, mainDbName: string) => {
  useEffect(() => {
    const sourceId = `vibe-learning-${projectId}`;

    // 注册项目专属工具
    const tools = [
      createVibeLearningSearchTool(projectId, mainDbName),
      createListResourcesTool(projectId),
      createReadResourceContentTool(projectId, mainDbName),
      createReadResourceRangeTool(projectId, mainDbName),
    ];
    toolRegistry.registerTools(sourceId, tools, true);

    return () => {
      // 清理工具
      toolRegistry.unregisterSource(sourceId);
    };
  }, [projectId, mainDbName]);
};

export default useVibeLearningChat;
