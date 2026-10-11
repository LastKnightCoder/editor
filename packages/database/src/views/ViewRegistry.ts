import type { DatabaseViewDefinition } from "./types";

/** 运行时视图注册表：每个 Database 实例一份，内置四视图与扩展视图走同一注册路径 */
export class ViewRegistry {
  private definitions = new Map<string, DatabaseViewDefinition>();

  register(definition: DatabaseViewDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`视图类型 "${definition.type}" 重复注册`);
    }
    this.definitions.set(definition.type, definition);
  }

  registerAll(definitions: readonly DatabaseViewDefinition[]): void {
    for (const definition of definitions) this.register(definition);
  }

  get(type: string): DatabaseViewDefinition | undefined {
    return this.definitions.get(type);
  }

  has(type: string): boolean {
    return this.definitions.has(type);
  }

  /** 注册顺序即创建弹窗与类型下拉的展示顺序 */
  list(): DatabaseViewDefinition[] {
    return Array.from(this.definitions.values());
  }
}
