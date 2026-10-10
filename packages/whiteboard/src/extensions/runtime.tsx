import { createContext, createElement, useContext } from "react";
import { ErrorBoundary, isEditableTarget } from "@tau/ui";
import { isKeyHotkey } from "is-hotkey";
import type Board from "../Board";
import { BoardUtil } from "../utils/BoardUtil";
import { PathUtil } from "../utils/PathUtil";
import type { WhiteboardAPI, WhiteboardContributions, WhiteboardExtension } from "./api";
import { createInternalPlugins } from "./internal";
import { registerBoardAccess } from "./access";
import { createSnapshotReader } from "./snapshot";
import { createExtensionScope } from "./scope";
import type { IBoardPlugin, PluginContextMenuItem, ContextMenuContext } from "../types/board";

const APIContext = createContext<WhiteboardAPI | null>(null);
export const WhiteboardAPIProvider = APIContext.Provider;
export function useWhiteboardAPI(): WhiteboardAPI {
  const api = useContext(APIContext);
  if (!api) throw new Error("缺少白板扩展上下文");
  return api;
}

export class ExtensionRuntime {
  readonly entries: { id: string; api: WhiteboardAPI; value: WhiteboardContributions }[] = [];
  readonly api: WhiteboardAPI;
  private cleanups: (() => void)[] = [];
  private active = false;
  private disposed = false;
  private readonly scopes: ReturnType<typeof createExtensionScope>[] = [];
  private readonly owners = new Map<string, string>();
  private readonly menuActions = new Map<
    string,
    { owner: string; run: PluginContextMenuItem["onSelect"] }
  >();

  ownerOf(type: string) {
    return this.owners.get(type) ?? type;
  }
  beginMenu() {
    this.menuActions.clear();
  }
  registerMenu(type: string, items: PluginContextMenuItem[]): PluginContextMenuItem[] {
    const owner = this.ownerOf(type);
    return items.map(item => {
      const id = `${owner}.${type}.menu.${item.key}`;
      this.menuActions.set(id, { owner, run: item.onSelect });
      return {
        ...item,
        children: item.children ? this.registerMenu(type, item.children) : undefined,
        onSelect: context => {
          void this.execute(id, context).catch(() => {});
        },
      };
    });
  }

  constructor(board: Board, extensions: readonly WhiteboardExtension[]) {
    const clone = <T,>(value: T): T => structuredClone(value);
    const readSnapshot = createSnapshotReader();
    let source = board.getSnapshot();
    let snapshot = readSnapshot(source);
    const getSnapshot = () => {
      if (source !== board.getSnapshot()) {
        source = board.getSnapshot();
        snapshot = readSnapshot(source);
      }
      return snapshot;
    };
    const listeners = new Map<string, Map<(...args: any[]) => void, (...args: any[]) => void>>();
    this.api = Object.freeze({
      getSnapshot,
      get children() {
        return getSnapshot().children;
      },
      get selection() {
        return getSnapshot().selection;
      },
      get viewPort() {
        return getSnapshot().viewPort;
      },
      get readonly() {
        return board.readonly;
      },
      get isDestroyed() {
        return board.isDestroyed;
      },
      get currentCreateType() {
        return board.currentCreateType;
      },
      set currentCreateType(value) {
        board.currentCreateType = value;
      },
      getElement: (id: string) => {
        const element = BoardUtil.getElementById(board, id);
        return element ? clone(element) : undefined;
      },
      submit: (ops, options) => {
        if (board.captureSubmission()()) board.apply(clone([...ops]), true, options?.historyGroup);
      },
      apply: (ops, updateHistory = true) => {
        if (board.captureSubmission()()) board.apply(clone(ops), updateHistory);
      },
      updateElement: (id, patch) => {
        const element = BoardUtil.getElementById(board, id);
        const path = element && PathUtil.getPathByElement(board, element);
        if (!element || !path || !board.captureSubmission(element)()) return false;
        if ("children" in patch || "id" in patch || "type" in patch)
          throw new Error("元素补丁不能改变身份或子树");
        const properties = Object.fromEntries(Object.keys(patch).map(key => [key, element[key]]));
        board.apply({ type: "set_node", path, properties, newProperties: clone(patch) });
        return true;
      },
      select: ids =>
        board.apply(
          {
            type: "set_selection",
            properties: board.selection,
            newProperties: {
              selectArea: null,
              selectedElements: ids.flatMap(id => {
                const element = BoardUtil.getElementById(board, id);
                return element ? [element] : [];
              }),
            },
          },
          false
        ),
      captureSubmission: target => {
        const id = typeof target === "string" ? target : target?.id;
        const element = id ? BoardUtil.getElementById(board, id) : undefined;
        return id && !element ? () => false : board.captureSubmission(element ?? undefined);
      },
      subscribe: listener => board.subscribe(listener),
      execute: (command, payload) => this.execute(command, payload),
      on: (event, listener) => {
        let group = listeners.get(event);
        if (!group) listeners.set(event, (group = new Map()));
        if (group.has(listener)) return;
        const wrapped = (...args: any[]) =>
          listener(
            ...([
              "onValueChange",
              "onSelectionChange",
              "onViewPortChange",
              "element:change",
              "element:insert",
              "element:remove",
            ].includes(event)
              ? readSnapshot(args)
              : args)
          );
        group.set(listener, wrapped);
        board.on(event, wrapped);
      },
      off: (event, listener) => {
        const group = listeners.get(event);
        const wrapped = group?.get(listener);
        if (wrapped) board.off(event, wrapped);
        group?.delete(listener);
      },
      emit: (event, ...args) => board.emit(event, ...args),
    } satisfies WhiteboardAPI);
    registerBoardAccess(this.api, board);

    const extensionIds = new Set<string>();
    const elementTypes = new Set<string>();
    const commandIds = new Set<string>();
    const contributionIds = new Set<string>();
    const inspectorTypes = new Set<string>();
    const pendingPlugins: { owner: string; plugin: IBoardPlugin }[] = [];
    const unique = (set: Set<string>, id: string) => {
      if (set.has(id)) throw new Error(`重复白板注册：${id}`);
      set.add(id);
    };
    try {
      for (const extension of extensions) {
        unique(extensionIds, extension.id);
        if (extension.apiVersion !== 1) throw new Error(`不支持的白板扩展版本：${extension.id}`);
        const scope = createExtensionScope(this.api, extension.id);
        this.scopes.push(scope);
        registerBoardAccess(scope.api, board);
        const value = extension.create(scope.api);
        this.entries.push({ id: extension.id, api: scope.api, value });
        for (const command of value.commands ?? []) {
          if (!command.id.includes(".")) throw new Error(`白板命令 ID 缺少命名空间：${command.id}`);
          unique(commandIds, command.id);
        }
        for (const contribution of [
          ...(value.tools ?? []),
          ...(value.layers ?? []),
          ...(value.menus ?? []),
          ...(value.ingest ?? []),
        ])
          unique(contributionIds, contribution.id);
        for (const type of Object.keys(value.inspectors ?? {})) unique(inspectorTypes, type);
        const plugins = createInternalPlugins(extension, board);
        for (const element of value.elements ?? []) {
          unique(elementTypes, element.type);
          plugins.push({
            name: element.type,
            render: (_board, props) =>
              createElement(element.render, { ...props, element: readSnapshot(props.element) }),
            getBounds: element.getBounds
              ? (_board, node) => element.getBounds!(clone(node))
              : undefined,
            isHit: (_board, node, x, y) => {
              if (element.isHit) return element.isHit(clone(node), x, y);
              const box = board.getBounds(node);
              return !!box && x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
            },
            moveElement: (_board, node, dx, dy) =>
              element.move
                ? element.move(clone(node), dx, dy)
                : { ...node, x: node.x + dx, y: node.y + dy },
          });
        }
        for (const plugin of plugins) {
          if (!(value.elements ?? []).some(element => element.type === plugin.name))
            unique(elementTypes, plugin.name);
          pendingPlugins.push({ owner: extension.id, plugin });
        }
      }
      for (const { value } of this.entries) {
        for (const item of [
          ...(value.menus ?? []),
          ...(value.hotkeys ?? []),
          ...(value.tools ?? []),
        ])
          if (!commandIds.has(item.command)) throw new Error(`未注册白板命令：${item.command}`);
      }
      for (const { owner, plugin } of pendingPlugins) {
        this.owners.set(plugin.name, owner);
        const api = this.entries.find(entry => entry.id === owner)!.api;
        const callbacks = new Map<PropertyKey, unknown>();
        board.addPlugin(
          new Proxy(plugin, {
            get(target, property, receiver) {
              const value = Reflect.get(target, property, receiver);
              if (typeof value !== "function") return value;
              if (!callbacks.has(property))
                callbacks.set(property, (...args: unknown[]) => {
                  try {
                    const result = value.apply(target, args);
                    return property === "render" ? (
                      <APIContext value={api}>{result}</APIContext>
                    ) : (
                      result
                    );
                  } catch (error) {
                    console.error(`白板扩展 ${owner} 的 ${String(property)} 失败`, error);
                    return property === "getCapabilities"
                      ? {}
                      : property === "getContextMenu"
                        ? []
                        : undefined;
                  }
                });
              return callbacks.get(property);
            },
          })
        );
      }
    } catch (error) {
      for (const { owner, plugin } of pendingPlugins) this.guard(owner, () => plugin.dispose?.());
      this.dispose();
      throw error;
    }
  }

  private guard(owner: string, run: () => void) {
    try {
      run();
    } catch (error) {
      console.error(`白板扩展 ${owner} 执行失败`, error);
    }
  }

  setActive(active: boolean) {
    if (this.disposed || active === this.active) return;
    this.active = active;
    if (active) {
      for (const { id, value } of this.entries)
        this.guard(id, () => {
          const cleanup = value.activate?.();
          if (cleanup) this.cleanups.push(() => this.guard(id, cleanup));
        });
    } else {
      for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.setActive(false);
    this.disposed = true;
    for (const { id, value } of [...this.entries].reverse())
      this.guard(id, () => value.dispose?.());
    this.scopes.forEach(scope => scope.dispose());
  }

  async execute(id: string, payload?: unknown) {
    if (this.disposed) throw new Error("白板已卸载");
    const menu = this.menuActions.get(id);
    if (menu) {
      try {
        return await menu.run(payload as ContextMenuContext);
      } catch (error) {
        console.error(`白板扩展 ${menu.owner} 的菜单命令 ${id} 失败`, error);
        throw error;
      }
    }
    for (const entry of this.entries) {
      const command = entry.value.commands?.find(command => command.id === id);
      if (!command) continue;
      try {
        if (command.enabled && !command.enabled(entry.api)) return;
        return await command.execute(entry.api, payload);
      } catch (error) {
        console.error(`白板扩展 ${entry.id} 的命令 ${id} 失败`, error);
        throw error;
      }
    }
    throw new Error(`未注册白板命令：${id}`);
  }

  onKeyDown(event: KeyboardEvent) {
    if (isEditableTarget(event.target) || event.isComposing) return false;
    for (const { value } of this.entries)
      for (const hotkey of value.hotkeys ?? []) {
        if (!isKeyHotkey(hotkey.key, event)) continue;
        event.preventDefault();
        void this.execute(hotkey.command).catch(() => {});
        return true;
      }
    return false;
  }

  ingest(source: "paste" | "drop", event: ClipboardEvent | DragEvent) {
    if (this.api.readonly || !this.api.captureSubmission()() || isEditableTarget(event.target))
      return false;
    for (const { id, api, value } of this.entries)
      for (const rule of value.ingest ?? []) {
        if (rule.source !== source) continue;
        let accepts = false;
        this.guard(id, () => {
          accepts = rule.accepts(event);
        });
        if (!accepts) continue;
        event.preventDefault();
        this.guard(id, () => {
          const pending = rule.run(api, event);
          if (pending) void pending.catch(error => console.error(`白板扩展 ${id} 导入失败`, error));
        });
        return true;
      }
    return false;
  }

  acceptsDrop(event: DragEvent) {
    if (this.api.readonly) return false;
    return this.entries.some(({ id, value }) =>
      value.ingest?.some(rule => {
        let accepted = false;
        this.guard(id, () => {
          accepted = rule.source === "drop" && rule.accepts(event);
        });
        return accepted;
      })
    );
  }

  get tools() {
    return this.entries.flatMap(entry => entry.value.tools ?? []).sort((a, b) => a.order - b.order);
  }
  get layers() {
    return this.entries.flatMap(entry => entry.value.layers ?? []);
  }
  renderLayers(position: "canvas" | "outside") {
    return this.entries.flatMap(({ id: owner, api, value }) =>
      (value.layers ?? [])
        .filter(layer => layer.position === position)
        .map(({ id, component: Layer }) => (
          <ErrorBoundary
            key={id}
            fallback={null}
            onError={error => console.error(`白板扩展 ${owner} 的界面层 ${id} 失败`, error)}
          >
            <APIContext value={api}>
              <Layer />
            </APIContext>
          </ErrorBoundary>
        ))
    );
  }
  get inspectors() {
    return Object.assign({}, ...this.entries.map(entry => entry.value.inspectors ?? {}));
  }
}
