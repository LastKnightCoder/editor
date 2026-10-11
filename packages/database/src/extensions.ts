import type { DatabaseSlots } from "./DatabaseHostContext";
import PluginManager from "./PluginManager";
import type { CellPlugin } from "./types";
import type { DatabaseCommandDefinition } from "./commands";
import type { DatabaseViewDefinition } from "./views/types";
import { ViewRegistry } from "./views/ViewRegistry";
import { builtInViewDefinitions } from "./views/builtInViews";
import {
  AggregateRegistry,
  type DatabaseAggregateDefinition,
} from "./core/formula/aggregateRegistry";
import { builtInAggregateDefinitions } from "./core/formula/aggregate";

export interface DatabaseFieldOverride {
  /** 目标字段类型，必须已由内置或其它扩展注册 */
  type: string;
  /** 浅合并到目标定义上；未覆盖的成员（如 capabilities）保留 */
  patch: Partial<Omit<CellPlugin<unknown>, "type">>;
}

export interface DatabaseContributions {
  fieldTypes?: readonly CellPlugin<any>[];
  fieldOverrides?: readonly DatabaseFieldOverride[];
  /** 扩展贡献的视图；type 必须带命名空间（含 "."），与内置或其它扩展重复报错 */
  views?: readonly DatabaseViewDefinition[];
  /** 扩展贡献的表尾聚合算子；op 必须带命名空间（含 "."），与内置 9 个或其它扩展重复报错 */
  aggregates?: readonly DatabaseAggregateDefinition[];
  /** 扩展贡献的命令；id 必须带命名空间（含 "."），与其它扩展重复报错 */
  commands?: readonly DatabaseCommandDefinition[];
  slots?: DatabaseSlots;
  /** 每个 Database 实例挂载时启动，返回的清理函数在卸载时执行 */
  activate?(): void | (() => void);
}

export interface DatabaseExtension {
  readonly id: string;
  readonly apiVersion: 1;
  create(): DatabaseContributions;
}

export function defineDatabaseExtension(
  definition: Omit<DatabaseExtension, "apiVersion">
): DatabaseExtension {
  if (!definition.id.includes(".")) throw new Error("Database 扩展 ID 必须包含命名空间");
  return Object.freeze({ ...definition, apiVersion: 1 as const });
}

export interface DatabaseExtensionRuntime {
  pluginManager: PluginManager;
  viewRegistry: ViewRegistry;
  aggregateRegistry: AggregateRegistry;
  commands: readonly DatabaseCommandDefinition[];
  slots: DatabaseSlots;
  activators: NonNullable<DatabaseContributions["activate"]>[];
}

/** 装配内置插件与扩展贡献；每条违规都抛错，信息里带扩展 id 与冲突键。每个 Database 实例调用一次，create() 亦随之每实例一次 */
export function installDatabaseExtensions(
  builtInPlugins: readonly CellPlugin<unknown>[],
  extensions: readonly DatabaseExtension[]
): DatabaseExtensionRuntime {
  const pluginManager = new PluginManager();
  pluginManager.registerPlugins([...builtInPlugins]);

  const viewRegistry = new ViewRegistry();
  viewRegistry.registerAll(builtInViewDefinitions);

  const aggregateRegistry = new AggregateRegistry();
  aggregateRegistry.registerAll(builtInAggregateDefinitions);

  const extensionIds = new Set<string>();
  const contributions: { id: string; value: DatabaseContributions }[] = [];
  for (const extension of extensions) {
    if (extensionIds.has(extension.id)) throw new Error(`Database 扩展 ID 重复：${extension.id}`);
    if (extension.apiVersion !== 1) throw new Error(`不支持的 Database 扩展版本：${extension.id}`);
    extensionIds.add(extension.id);
    contributions.push({ id: extension.id, value: extension.create() });
  }

  for (const { id, value } of contributions) {
    for (const plugin of value.fieldTypes ?? []) {
      if (pluginManager.hasPlugin(plugin.type))
        throw new Error(`Database 扩展 ${id} 注册了已存在的字段类型：${plugin.type}`);
      pluginManager.registerPlugin(plugin);
    }
  }

  for (const { id, value } of contributions) {
    for (const definition of value.views ?? []) {
      if (!definition.type.includes("."))
        throw new Error(
          `Database 扩展 ${id} 的视图类型必须带命名空间（含 "."）：${definition.type}`
        );
      if (viewRegistry.has(definition.type))
        throw new Error(`Database 扩展 ${id} 注册了已存在的视图类型：${definition.type}`);
      viewRegistry.register(definition);
    }
  }

  const aggregateOwners = new Map<string, string>();
  for (const { id, value } of contributions) {
    for (const definition of value.aggregates ?? []) {
      // 先查重（内置 9 个不带命名空间，撞名优先报「已存在」），再查命名空间
      const owner = aggregateOwners.get(definition.op);
      if (owner !== undefined)
        throw new Error(`Database 聚合算子 ${definition.op} 被多个扩展注册：${owner} 与 ${id}`);
      if (aggregateRegistry.has(definition.op))
        throw new Error(`Database 扩展 ${id} 注册了已存在的聚合算子：${definition.op}`);
      if (!definition.op.includes("."))
        throw new Error(`Database 扩展 ${id} 的聚合算子必须带命名空间（含 "."）：${definition.op}`);
      aggregateOwners.set(definition.op, id);
      aggregateRegistry.register(definition);
    }
  }

  const commands: DatabaseCommandDefinition[] = [];
  const commandOwners = new Map<string, string>();
  for (const { id, value } of contributions) {
    for (const command of value.commands ?? []) {
      if (!command.id.includes("."))
        throw new Error(`Database 扩展 ${id} 的命令 id 必须带命名空间（含 "."）：${command.id}`);
      const owner = commandOwners.get(command.id);
      if (owner !== undefined)
        throw new Error(`Database 命令 ${command.id} 被多个扩展注册：${owner} 与 ${id}`);
      commandOwners.set(command.id, id);
      commands.push(command);
    }
  }

  const overrideOwners = new Map<string, string>();
  for (const { id, value } of contributions) {
    for (const { type, patch } of value.fieldOverrides ?? []) {
      if (!pluginManager.hasPlugin(type))
        throw new Error(`Database 扩展 ${id} 覆盖了不存在的字段类型：${type}`);
      const owner = overrideOwners.get(type);
      if (owner !== undefined)
        throw new Error(`字段类型 ${type} 被多个扩展覆盖：${owner} 与 ${id}`);
      overrideOwners.set(type, id);
      const existing = pluginManager.getPlugin(type)!;
      pluginManager.replacePlugin({ ...existing, ...patch, type });
    }
  }

  const slots: DatabaseSlots = {};
  const slotOwners = new Map<string, string>();
  for (const { id, value } of contributions) {
    const provided = value.slots ?? {};
    for (const key of Object.keys(provided)) {
      const owner = slotOwners.get(key);
      if (owner !== undefined)
        throw new Error(`Database 插槽 ${key} 被多个扩展提供：${owner} 与 ${id}`);
      slotOwners.set(key, id);
    }
    Object.assign(slots, provided);
  }

  const activators = contributions
    .map(({ value }) => value.activate)
    .filter((activate): activate is NonNullable<typeof activate> => activate !== undefined);

  return { pluginManager, viewRegistry, aggregateRegistry, commands, slots, activators };
}
