import { createElement, Suspense, type ReactElement } from "react";
import type { Editor } from "slate";
import type { RenderElementProps } from "slate-react";

import type { EditorExtension, ElementBehaviors, ElementSpec } from "../api/extension";
import { isLegacyAdapter, toEditorExtension, type AnyExtension } from "../api/legacy";
import type { Plugin } from "../utils/plugin";
import type { IBlockPanelListItem, IConfigItem, IHotKeyConfig } from "../types";

/** 一个扩展贡献的插件：内核按扩展逐组应用，出错隔离到组（extensionGuard.ts） */
export interface ExtensionPluginGroup {
  /** 扩展 id，熔断与上报按它计 */
  readonly type: string;
  readonly plugins: readonly Plugin[];
}

/** 某元素类型上的一组声明式行为及其来源扩展，由内核的行为分发器调用（extensionGuard.ts） */
export interface ElementBehaviorEntry {
  readonly extension: string;
  readonly behaviors: ElementBehaviors;
}

type ElementRenderer = (props: RenderElementProps) => ReactElement | undefined;

/** v2 元素的 kind / isVoid 声明落到 Slate 的 schema 判定上 */
const schemaPlugin =
  (elements: readonly ElementSpec[]): Plugin =>
  (editor: Editor) => {
    const inline = new Set(elements.filter(e => e.kind === "inline").map(e => e.type));
    const block = new Set(elements.filter(e => e.kind === "block").map(e => e.type));
    const voids = new Set(elements.filter(e => e.isVoid).map(e => e.type));
    const { isInline, isBlock, isVoid } = editor;
    editor.isInline = element => inline.has(element.type) || isInline(element);
    editor.isBlock = element => block.has(element.type) || isBlock(element);
    editor.isVoid = element => voids.has(element.type) || isVoid(element);
    return editor;
  };

/** `lazy()` 组件加载期间的空壳：保留 attributes / children，Slate 的 DOM 映射不断 */
const renderSpec = (spec: ElementSpec): ElementRenderer => {
  const tag = spec.kind === "inline" ? "span" : "div";
  return ({ attributes, element, children }) =>
    createElement(
      Suspense,
      { fallback: createElement(tag, { ...attributes, contentEditable: false }, children) },
      createElement(spec.render, { attributes, element, children })
    );
};

/**
 * 扩展的预计算结果：插件链、快捷键、悬浮工具条条目与 type → 渲染的分发表。
 *
 * 一个 kit 一份（取代原先每个编辑器一个 PluginOptimizer）：同一个 kit 的多个编辑器共享，
 * 不必每次挂载都重新收集。扩展集合由 kit 在创建时定好，所以这里只算一次，无需缓存淘汰。
 */
export class ExtensionAssembly {
  readonly extensions: readonly EditorExtension[];
  readonly plugins: readonly Plugin[];
  readonly pluginGroups: readonly ExtensionPluginGroup[];
  readonly hotkeyConfigs: readonly IHotKeyConfig[];
  readonly hoveringBarElements: readonly IConfigItem[];
  /** 本装配能渲染的元素类型（按扩展顺序） */
  readonly elementTypes: readonly string[];
  /** 元素类型 → 行为列表：该类型自己的在前，其他扩展经 behaviorsFor 挂上来的按扩展顺序在后 */
  readonly behaviors: ReadonlyMap<string, readonly ElementBehaviorEntry[]>;
  private readonly renderers = new Map<string, ElementRenderer>();
  private readonly owners = new Map<string, EditorExtension>();
  private readonly hotkeyOwners = new WeakMap<IHotKeyConfig, string>();

  constructor(extensions: readonly AnyExtension[]) {
    this.extensions = extensions.map(toEditorExtension);

    const pluginGroups: ExtensionPluginGroup[] = [];
    const hotkeyConfigs: IHotKeyConfig[] = [];
    const hoveringBarElements: IConfigItem[] = [];
    const own = new Map<string, ElementBehaviorEntry>();
    const attached = new Map<string, ElementBehaviorEntry[]>();
    for (const extension of this.extensions) {
      // 单个扩展的收集出错不应连带整个编辑器起不来
      try {
        const collected = this.collect(extension);
        pluginGroups.push({ type: extension.id, plugins: collected.plugins });
        for (const config of collected.hotkeys) this.hotkeyOwners.set(config, extension.id);
        hotkeyConfigs.push(...collected.hotkeys);
        hoveringBarElements.push(...collected.toolbar);
        for (const [type, renderer] of collected.renderers) {
          this.renderers.set(type, renderer);
          this.owners.set(type, extension);
        }
        for (const [type, entry] of collected.behaviors) own.set(type, entry);
        for (const [type, entry] of collected.attached) {
          attached.set(type, [...(attached.get(type) ?? []), entry]);
        }
      } catch (error) {
        console.error(`[editor] 扩展 "${extension.id}" 装配失败:`, error);
      }
    }
    this.pluginGroups = pluginGroups;
    this.plugins = pluginGroups.flatMap(group => group.plugins);
    this.hotkeyConfigs = hotkeyConfigs;
    this.hoveringBarElements = hoveringBarElements;
    const behaviors = new Map<string, ElementBehaviorEntry[]>();
    for (const type of new Set([...own.keys(), ...attached.keys()])) {
      behaviors.set(type, [
        ...(own.has(type) ? [own.get(type)!] : []),
        ...(attached.get(type) ?? []),
      ]);
    }
    this.behaviors = behaviors;
    this.elementTypes = [...this.renderers.keys()];
  }

  /** 先把一个扩展的全部贡献收齐，中途抛错则整个扩展都不装，不留半截 */
  private collect(extension: EditorExtension) {
    const renderers = new Map<string, ElementRenderer>();
    const behaviors = new Map<string, ElementBehaviorEntry>();
    const attached = new Map<string, ElementBehaviorEntry>();
    if (isLegacyAdapter(extension)) {
      renderers.set(extension.legacy.type, extension.legacyRender);
      return {
        plugins: [...(extension.plugins ?? [])],
        hotkeys: [...extension.legacyHotkeys],
        toolbar: [...(extension.toolbar ?? [])],
        renderers,
        behaviors,
        attached,
      };
    }
    const elements = extension.elements ?? [];
    for (const spec of elements) {
      renderers.set(spec.type, renderSpec(spec));
      if (spec.behaviors) {
        behaviors.set(spec.type, { extension: extension.id, behaviors: spec.behaviors });
      }
    }
    for (const [type, handlers] of Object.entries(extension.behaviorsFor ?? {})) {
      attached.set(type, { extension: extension.id, behaviors: handlers });
    }
    return {
      plugins: [...(elements.length ? [schemaPlugin(elements)] : []), ...(extension.plugins ?? [])],
      hotkeys: [] as IHotKeyConfig[],
      toolbar: [...(extension.toolbar ?? [])],
      renderers,
      behaviors,
      attached,
    };
  }

  hasElement(type: string): boolean {
    return this.renderers.has(type);
  }

  render(props: RenderElementProps): ReactElement | undefined {
    return this.renderers.get(props.element.type)?.(props);
  }

  /** 元素类型归哪个扩展（上报与熔断按扩展 id） */
  getElementOwner(type: string): EditorExtension | undefined {
    return this.owners.get(type);
  }

  /** 快捷键来自哪个扩展（熔断按扩展停用） */
  getHotkeyOwner(config: IHotKeyConfig): string | undefined {
    return this.hotkeyOwners.get(config);
  }

  /** 块菜单条目：每次打开菜单求值；单个扩展出错只丢它自己的条目 */
  getBlockPanelItems(editor: Editor): IBlockPanelListItem[] {
    return this.extensions.flatMap(extension => {
      try {
        const { blockPanel } = extension;
        return blockPanel
          ? [...(typeof blockPanel === "function" ? blockPanel(editor) : blockPanel)]
          : [];
      } catch (error) {
        console.error(`[editor] 扩展 "${extension.id}" 块菜单出错:`, error);
        return [];
      }
    });
  }
}
