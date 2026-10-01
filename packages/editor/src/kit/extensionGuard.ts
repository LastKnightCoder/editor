import { Editor, Element, Node, Text, type Path } from "slate";

import type { Plugin } from "../utils/plugin";
import type { IHotKeyConfig } from "../types";
import type { ElementBehaviorEntry, ExtensionPluginGroup } from "./ExtensionAssembly";
import type { ExtensionErrorEvent, ExtensionErrorReporter } from "../services/errorReporter";

/**
 * 扩展的错误隔离（01 §5.2）：行为出错回退到上一层实现，同一扩展短时间内反复出错就熔断，
 * 停用它的行为与快捷键；渲染出错由 ElementErrorBoundary 兜住。
 */

/** 窗口内出错达到阈值即熔断 */
export const CIRCUIT_BREAKER_THRESHOLD = 3;
export const CIRCUIT_BREAKER_WINDOW_MS = 10_000;

export interface ExtensionCircuitBreaker {
  isDisabled(extension: string): boolean;
  /** 记一次行为错误并上报，窗口内达到阈值即停用该扩展 */
  record(
    extension: string,
    phase: "plugin" | "behavior" | "hotkey" | "command" | "ingest" | "copy",
    error: unknown
  ): void;
  /** 只上报不计数：渲染错误由错误边界各自兜住，不牵连行为；内核自带逻辑也不熔断 */
  report(extension: string, phase: ExtensionErrorEvent["phase"], error: unknown): void;
}

export function createCircuitBreaker(
  getReporter: () => ExtensionErrorReporter,
  now: () => number = Date.now
): ExtensionCircuitBreaker {
  const failures = new Map<string, number[]>();
  const disabled = new Set<string>();
  return {
    isDisabled: extension => disabled.has(extension),
    record(extension, phase, error) {
      const current = now();
      const recent = (failures.get(extension) ?? []).filter(
        time => current - time < CIRCUIT_BREAKER_WINDOW_MS
      );
      recent.push(current);
      failures.set(extension, recent);
      const tripped = !disabled.has(extension) && recent.length >= CIRCUIT_BREAKER_THRESHOLD;
      if (tripped) disabled.add(extension);
      getReporter().report({ extension, phase, error, disabled: tripped });
    },
    report(extension, phase, error) {
      getReporter().report({ extension, phase, error, disabled: false });
    },
  };
}

/**
 * 受隔离的行为方法。isVoid / isInline / isBlock 这类 schema 判定不在其列：
 * 停用它们会改变文档结构的解释，比扩展出错本身更糟；apply 关系到操作完整性，也不拦。
 */
const GUARDED_METHODS = new Set([
  "insertBreak",
  "insertSoftBreak",
  "insertText",
  "insertData",
  "insertFragment",
  "insertFragmentData",
  "insertTextData",
  "insertNode",
  "deleteBackward",
  "deleteForward",
  "deleteFragment",
  "getFragment",
  "setFragmentData",
  "handleDrop",
  "normalizeNode",
]);

type EditorMethods = Record<string, unknown>;

const snapshotMethods = (editor: Editor): Map<string, unknown> => {
  const snapshot = new Map<string, unknown>();
  for (const [key, value] of Object.entries(editor as unknown as EditorMethods)) {
    if (typeof value === "function") snapshot.set(key, value);
  }
  return snapshot;
};

/**
 * 按扩展逐组应用插件，并把该组改写过的方法包一层：出错时回退到改写前的实现。
 * 扩展在抛错前已经产生了操作时不再回退，否则同一次按键会被执行两遍（例如回车拆出两行）。
 */
export function applyGuardedPlugins(
  editor: Editor,
  groups: readonly ExtensionPluginGroup[],
  breaker: ExtensionCircuitBreaker
): Editor {
  let current = editor;
  for (const group of groups) {
    const before = snapshotMethods(current);
    try {
      current = group.plugins.reduce((acc: Editor, plugin: Plugin) => plugin(acc), current);
    } catch (error) {
      // 插件应用到一半：恢复该组改写前的方法，整组视为未装
      const methods = current as unknown as EditorMethods;
      for (const [key, value] of before) methods[key] = value;
      breaker.record(group.type, "plugin", error);
      continue;
    }
    wrapChangedMethods(current, before, group.type, breaker);
  }
  return current;
}

function wrapChangedMethods(
  editor: Editor,
  before: Map<string, unknown>,
  extension: string,
  breaker: ExtensionCircuitBreaker
) {
  const methods = editor as unknown as EditorMethods;
  for (const key of GUARDED_METHODS) {
    const value = methods[key];
    if (typeof value !== "function" || before.get(key) === value) continue;
    const next = value as (...args: unknown[]) => unknown;
    const previous = before.get(key) as ((...args: unknown[]) => unknown) | undefined;
    methods[key] = function guarded(this: unknown, ...args: unknown[]) {
      if (breaker.isDisabled(extension)) return previous?.apply(this, args);
      const operationCount = editor.operations.length;
      try {
        return next.apply(this, args);
      } catch (error) {
        breaker.record(extension, "behavior", error);
        if (editor.operations.length !== operationCount) return undefined;
        return previous?.apply(this, args);
      }
    };
  }
}

/**
 * v2 元素行为的分发（01 §5.1）：从选区所在的最内层元素往外找声明了该行为的类型，
 * 依次调用，返回 true 即停；都不处理就交给插件链（旧扩展）与 Slate 默认行为。
 * 每个 handler 单独隔离：出错计入该扩展的熔断，并按「未处理」继续往外找。
 */
export function withElementBehaviors(
  editor: Editor,
  behaviors: ReadonlyMap<string, readonly ElementBehaviorEntry[]>,
  breaker: ExtensionCircuitBreaker
): Editor {
  if (behaviors.size === 0) return editor;
  const { insertBreak, deleteBackward, insertText, normalizeNode } = editor;
  type Handlers = ElementBehaviorEntry["behaviors"];
  type Name = keyof Handlers;

  const run = (
    entry: ElementBehaviorEntry,
    invoke: (handlers: Handlers) => boolean | undefined
  ) => {
    if (breaker.isDisabled(entry.extension)) return false;
    const operationCount = editor.operations.length;
    try {
      return invoke(entry.behaviors) === true;
    } catch (error) {
      breaker.record(entry.extension, "behavior", error);
      // 出错前已经改了文档就视为已处理，避免同一次输入再被默认行为执行一遍
      return editor.operations.length !== operationCount;
    }
  };

  /** 一个节点上的行为按顺序试，有一个处理即停 */
  const runAll = (
    node: Element,
    name: Name,
    invoke: (handlers: Handlers) => boolean | undefined
  ): boolean =>
    (behaviors.get(node.type) ?? []).some(entry => !!entry.behaviors[name] && run(entry, invoke));

  const hasBehavior = (node: Node, name: Name) =>
    Element.isElement(node) && !!behaviors.get(node.type)?.some(entry => entry.behaviors[name]);

  /** 选区内从最内层元素往外找 */
  const dispatch = (
    name: "insertBreak" | "deleteBackward" | "insertText",
    invoke: (handlers: Handlers, entry: [Element, Path]) => boolean | undefined
  ): boolean => {
    if (!editor.selection) return false;
    const matches = Array.from(
      Editor.nodes<Element>(editor, { match: node => hasBehavior(node, name), mode: "all" })
    ).reverse();
    return matches.some(([node, path]) =>
      runAll(node, name, handlers => invoke(handlers, [node, path]))
    );
  };

  editor.insertBreak = () => {
    if (!dispatch("insertBreak", (handlers, entry) => handlers.insertBreak?.(editor, entry)))
      insertBreak();
  };
  editor.deleteBackward = unit => {
    if (
      !dispatch("deleteBackward", (handlers, entry) =>
        handlers.deleteBackward?.(editor, entry, unit)
      )
    )
      deleteBackward(unit);
  };
  editor.insertText = (text, options) => {
    // 指定了 at 的插入不针对选区，不走元素行为
    if (
      options?.at ||
      !dispatch("insertText", (handlers, entry) => handlers.insertText?.(editor, entry, text))
    )
      insertText(text, options);
  };
  editor.normalizeNode = (entry, options) => {
    const [node] = entry;
    if (
      hasBehavior(node, "normalize") &&
      runAll(node as Element, "normalize", handlers =>
        handlers.normalize?.(editor, entry as [Element, Path])
      )
    )
      return;
    normalizeNode(entry, options);
  };
  return editor;
}

/** 快捷键的 action 同样隔离；来自扩展的按扩展熔断，内核与宿主 prop 传入的只上报 */
export function guardHotkeys(
  configs: readonly IHotKeyConfig[],
  getOwner: (config: IHotKeyConfig) => string | undefined,
  breaker: ExtensionCircuitBreaker
): IHotKeyConfig[] {
  return configs.map(config => {
    const owner = getOwner(config);
    return {
      ...config,
      action: (editor, event) => {
        if (owner && breaker.isDisabled(owner)) return;
        try {
          config.action(editor, event);
        } catch (error) {
          if (owner) breaker.record(owner, "hotkey", error);
          else breaker.report("editor", "hotkey", error);
        }
      },
    };
  });
}

/**
 * 未知节点保护（ER-006）：kit 没注册的元素类型按 void 处理、整棵子树不参与规范化，
 * 保证它原样留在文档里。行内还是块级按所在位置判断：父元素含文本子节点即为行内。
 */
export function withUnknownElements(editor: Editor, isKnown: (type: string) => boolean): Editor {
  const { isVoid, isInline, normalizeNode } = editor;
  const isUnknown = (element: Element) => !isKnown(element.type);
  let inlineCache = new WeakMap<Element, boolean>();
  let cachedChildren: Editor["children"] | undefined;

  const fillInlineCache = () => {
    inlineCache = new WeakMap();
    cachedChildren = editor.children;
    const visit = (parent: Editor | Element) => {
      const inline = !Editor.isEditor(parent) && parent.children.some(child => Text.isText(child));
      for (const child of parent.children) {
        if (!Element.isElement(child)) continue;
        if (isUnknown(child)) inlineCache.set(child, inline);
        visit(child);
      }
    };
    visit(editor);
  };

  const isUnknownInline = (element: Element): boolean => {
    if (cachedChildren !== editor.children || !inlineCache.has(element)) fillInlineCache();
    // 不在文档里的节点（如待插入的片段）无从判断，按块处理并记下，避免反复遍历
    if (!inlineCache.has(element)) inlineCache.set(element, false);
    return inlineCache.get(element)!;
  };

  editor.isVoid = element => (isUnknown(element) ? true : isVoid(element));
  editor.isInline = element => (isUnknown(element) ? isUnknownInline(element) : isInline(element));

  const insideUnknown = (path: Path): boolean => {
    let node: Node = editor;
    for (const index of path) {
      if (!Element.isElement(node) && !Editor.isEditor(node)) return false;
      node = node.children[index];
      if (Element.isElement(node) && isUnknown(node)) return true;
    }
    return false;
  };

  editor.normalizeNode = (entry, options) => {
    const [node, path] = entry;
    const emptyUnknown = Element.isElement(node) && isUnknown(node) && node.children.length === 0;
    if (path.length > 0 && !emptyUnknown && insideUnknown(path)) return;
    normalizeNode(entry, options);
  };

  return editor;
}
