import {
  CellFilterDefinition,
  CellPlugin,
  CellValue,
  ColumnDef,
  FieldCapabilities,
  RowData,
} from "./types";
import type { ValueType } from "./core/formula/types";
import type { DatabaseFieldModel } from "./model/field-model";
import { missingPlugin } from "./components/MissingPlugin";

export class PluginManager {
  private plugins: Map<string, CellPlugin<unknown>> = new Map();

  registerPlugin(plugin: CellPlugin<unknown>): void {
    if (this.plugins.has(plugin.type)) {
      throw new Error(`类型为"${plugin.type}"的插件已经注册，如需覆盖请使用 replacePlugin。`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  /** 替换已注册插件（如扩展经 fieldOverrides 改造内置类型）；要求该类型已存在 */
  replacePlugin(plugin: CellPlugin<unknown>): void {
    if (!this.plugins.has(plugin.type)) {
      throw new Error(`类型为"${plugin.type}"的插件尚未注册，无法替换，请先 registerPlugin。`);
    }
    this.plugins.set(plugin.type, plugin);
  }

  registerPlugins(plugins: CellPlugin<unknown>[]): void {
    plugins.forEach(plugin => this.registerPlugin(plugin));
  }

  getPlugin(type: string): CellPlugin<unknown> | undefined {
    return this.plugins.get(type) ?? missingPlugin;
  }

  hasPlugin(type: string): boolean {
    return this.plugins.has(type);
  }

  /** 字段能力查询：未注册类型或未声明该能力均返回 false */
  hasCapability(type: string, capability: keyof FieldCapabilities): boolean {
    return this.plugins.get(type)?.capabilities?.[capability] === true;
  }

  /** 字段的纯数据 model（值口径与配置版本迁移，D-137）；未注册或插件未挂 model 时返回 undefined */
  getModel(type: string): DatabaseFieldModel | undefined {
    return this.plugins.get(type)?.model;
  }

  /** 某列参与运算的值类型：插件可按列声明（如公式列取结果类型）；未注册或未声明返回 undefined */
  getValueType(column: ColumnDef): ValueType | undefined {
    const plugin = this.plugins.get(column.type);
    const declared = plugin?.valueType;
    return typeof declared === "function" ? declared(column) : declared;
  }

  getAllPlugins(): CellPlugin<unknown>[] {
    return Array.from(this.plugins.values());
  }

  transformBeforeSave(type: string, value: CellValue, config: unknown): any {
    const plugin = this.getPlugin(type);
    return plugin?.beforeSave ? plugin.beforeSave(value, config) : value;
  }

  transformAfterLoad(type: string, value: CellValue, config: unknown): any {
    const plugin = this.getPlugin(type);
    return plugin?.afterLoad ? plugin.afterLoad(value, config) : value;
  }

  /** 某列可用的筛选操作符；插件可按列给出（如公式列按结果类型） */
  getFilterDefinitions(column: ColumnDef): CellFilterDefinition<unknown>[] {
    const filters = this.getPlugin(column.type)?.filters;
    return (typeof filters === "function" ? filters(column) : filters) ?? [];
  }

  executeSearch(
    type: string,
    searchValue: string,
    cellValue: CellValue,
    column: ColumnDef,
    row: RowData
  ): boolean {
    const plugin = this.getPlugin(type);
    if (plugin?.search) {
      return plugin.search(searchValue, cellValue, column, row);
    }
    // 降级为字符串包含匹配
    const cellStr = String(cellValue ?? "").toLowerCase();
    const searchStr = searchValue.toLowerCase();
    return cellStr.includes(searchStr);
  }
}

export const createPluginManager = (): PluginManager => {
  return new PluginManager();
};

export default PluginManager;
