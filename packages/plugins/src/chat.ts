import type { ComponentType, ReactNode } from "react";
import type { ToolCallExecutionState } from "@tau/shared/chat-core";
import type { Disposable } from "./contract";
import type { JsonValue } from "./json";
import { assertLocalId } from "./ids";

export type { ToolCallExecutionState } from "@tau/shared/chat-core";

export interface PluginToolRendererProps {
  execution: Readonly<ToolCallExecutionState>;
  isDark: boolean;
  parsedInput: unknown | null;
  inputParseError?: string;
  data: JsonValue | null;
  dataVersion: number | null;
  renderDefault(): ReactNode;
}

export interface PluginToolRendererDefinition {
  mcpId: string;
  toolName: string;
  component: ComponentType<PluginToolRendererProps>;
}

export interface PluginChat {
  /** 激活成功后发布，停用时自动回收；展示不受 MCP 执行开关影响。 */
  registerToolRenderer(definition: PluginToolRendererDefinition): Promise<Disposable>;
}

export function snapshotToolRendererDefinition(
  definition: PluginToolRendererDefinition
): PluginToolRendererDefinition {
  assertLocalId(definition.mcpId);
  if (typeof definition.toolName !== "string" || !definition.toolName.trim())
    throw new Error("工具渲染器需要原始工具名称");
  const component: unknown = definition.component;
  if (
    typeof component !== "function" &&
    !(
      component &&
      typeof component === "object" &&
      "$$typeof" in component &&
      [
        Symbol.for("react.memo"),
        Symbol.for("react.forward_ref"),
        Symbol.for("react.lazy"),
      ].includes(component.$$typeof as symbol)
    )
  )
    throw new Error("工具渲染器需要 React 组件");
  return Object.freeze({ ...definition });
}
