import type { ToolCallCustomRenderer } from "./types.ts";

interface ToolCallRendererEntry {
  toolName: string;
  renderer: ToolCallCustomRenderer;
}

interface ToolCallRendererRegistration {
  renderer: ToolCallCustomRenderer;
  generation: number;
  toolName?: string;
}

class ToolCallRendererRegistry {
  private renderers = new Map<string, ToolCallRendererRegistration>();
  private listeners = new Set<() => void>();
  private revision = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => this.revision;

  register(toolName: string, renderer: ToolCallCustomRenderer): void {
    this.renderers.set(toolName, { renderer, generation: this.revision + 1 });
    this.publish();
  }

  registerOwned(toolName: string, renderer: ToolCallCustomRenderer): { dispose(): void } {
    if (this.renderers.has(toolName)) throw new Error(`工具渲染器已注册：${toolName}`);
    const registration = { renderer, generation: this.revision + 1, toolName };
    this.renderers.set(toolName, registration);
    this.publish();
    return {
      dispose: () => {
        if (this.renderers.get(toolName) === registration) this.unregister(toolName);
      },
    };
  }

  registerMultiple(entries: ToolCallRendererEntry[]): void {
    entries.forEach(entry => this.register(entry.toolName, entry.renderer));
  }

  unregister(toolName: string): boolean {
    const removed = this.renderers.delete(toolName);
    if (removed) this.publish();
    return removed;
  }

  get(toolName: string): ToolCallCustomRenderer | undefined {
    return this.renderers.get(toolName)?.renderer;
  }

  resolve(toolName: string, rendererKey: string): ToolCallRendererRegistration | undefined {
    const named = this.renderers.get(toolName);
    if (named?.toolName === toolName) return named;
    const keyed = this.renderers.get(rendererKey);
    return keyed?.toolName && keyed.toolName !== toolName ? named : (keyed ?? named);
  }

  private publish(): void {
    this.revision++;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("工具渲染器订阅失败", error);
      }
    }
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

export function registerOwnedToolCallRenderer(toolName: string, renderer: ToolCallCustomRenderer) {
  return toolCallRendererRegistry.registerOwned(toolName, renderer);
}
