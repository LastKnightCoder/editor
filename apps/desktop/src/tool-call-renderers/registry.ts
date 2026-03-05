import {
  registerToolCallRenderer as registerSharedToolCallRenderer,
  registerToolCallRenderers as registerSharedToolCallRenderers,
  unregisterToolCallRenderer as unregisterSharedToolCallRenderer,
  getToolCallRenderer as getSharedToolCallRenderer,
} from "@tau/shared";
import type { ToolCallCustomRenderer } from "./types";

interface ToolCallRendererEntry {
  toolName: string;
  renderer: ToolCallCustomRenderer;
}

export const toolCallRendererRegistry = {
  register(toolName: string, renderer: ToolCallCustomRenderer): void {
    registerSharedToolCallRenderer(
      toolName,
      renderer as Parameters<typeof registerSharedToolCallRenderer>[1],
    );
  },
  registerMultiple(entries: ToolCallRendererEntry[]): void {
    registerSharedToolCallRenderers(
      entries as Parameters<typeof registerSharedToolCallRenderers>[0],
    );
  },
  unregister(toolName: string): boolean {
    return unregisterSharedToolCallRenderer(toolName);
  },
  getRenderer(toolName: string): ToolCallCustomRenderer | undefined {
    return getSharedToolCallRenderer(toolName) as
      | ToolCallCustomRenderer
      | undefined;
  },
};

export function registerToolCallRenderer(
  toolName: string,
  renderer: ToolCallCustomRenderer,
): void {
  toolCallRendererRegistry.register(toolName, renderer);
}

export function registerToolCallRenderers(
  entries: ToolCallRendererEntry[],
): void {
  toolCallRendererRegistry.registerMultiple(entries);
}

export function unregisterToolCallRenderer(toolName: string): boolean {
  return toolCallRendererRegistry.unregister(toolName);
}

export function getToolCallRenderer(
  toolName: string,
): ToolCallCustomRenderer | undefined {
  return toolCallRendererRegistry.getRenderer(toolName);
}
