import type { TerminalRenderer } from "./types.js";

export class TerminalRendererRegistry {
  private renderers = new Map<string, TerminalRenderer>();

  register(renderer: TerminalRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  registerMany(renderers: TerminalRenderer[]): void {
    for (const renderer of renderers) {
      this.register(renderer);
    }
  }

  getRenderer(type: string): TerminalRenderer | undefined {
    return this.renderers.get(type);
  }
}

export const registry = new TerminalRendererRegistry();
