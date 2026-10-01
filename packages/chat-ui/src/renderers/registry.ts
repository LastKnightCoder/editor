import type { ToolCallCustomRenderer } from "./types.ts";

interface ToolCallRendererEntry {
  toolName: string;
  renderer: ToolCallCustomRenderer;
}

class ToolCallRendererRegistry {
  private renderers = new Map<string, ToolCallCustomRenderer>();

  register(toolName: string, renderer: ToolCallCustomRenderer): void {
    this.renderers.set(toolName, renderer);
  }

  registerMultiple(entries: ToolCallRendererEntry[]): void {
    entries.forEach(entry => this.register(entry.toolName, entry.renderer));
  }

  unregister(toolName: string): boolean {
    return this.renderers.delete(toolName);
  }

  get(toolName: string): ToolCallCustomRenderer | undefined {
    return this.renderers.get(toolName);
  }
}

export const toolCallRendererRegistry = new ToolCallRendererRegistry();

export function registerToolCallRenderer(toolName: string, renderer: ToolCallCustomRenderer): void {
  toolCallRendererRegistry.register(toolName, renderer);
}

export function registerToolCallRenderers(entries: ToolCallRendererEntry[]): void {
  toolCallRendererRegistry.registerMultiple(entries);
}

export function unregisterToolCallRenderer(toolName: string): boolean {
  return toolCallRendererRegistry.unregister(toolName);
}

export function getToolCallRenderer(toolName: string) {
  return toolCallRendererRegistry.get(toolName);
}
