import { useEffect } from "react";
import toolRegistry from "@/tools";
import { createUnifiedVibeLearningTool } from "@/tools/vibeLearningSearchTool";

/** 注册页面专属工具，返回工具作用域：交给本页对话的 ChatContainer toolScope，别的对话拿不到 */
export const useVibeLearningChat = (projectId: number, mainDbName: string) => {
  const sourceId = `vibe-learning-${projectId}`;
  useEffect(() => {
    const tools = [createUnifiedVibeLearningTool(projectId, mainDbName)];
    toolRegistry.registerScopedTools(sourceId, "学习项目资料", tools);

    return () => {
      // 清理工具
      toolRegistry.unregisterSource(sourceId);
    };
  }, [sourceId, projectId, mainDbName]);

  return sourceId;
};

export default useVibeLearningChat;
