import type { ToolDefinition, ToolExecutionContext } from "@/types/tool";

/** 每次执行都为命令客户端绑定会话上下文，定义与实际业务实现保持同一工厂。 */
export function contextualTools(
  build: (context?: ToolExecutionContext) => ToolDefinition[]
): ToolDefinition[] {
  return build().map(tool => ({
    ...tool,
    executor: (args, context) => {
      const bound = build(context).find(candidate => candidate.name === tool.name);
      if (!bound) throw new Error(`工具定义已失效：${tool.name}`);
      return bound.executor(args, context);
    },
  }));
}
