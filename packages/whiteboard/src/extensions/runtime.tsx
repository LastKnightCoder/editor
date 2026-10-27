import { whiteboardAuthorOwner } from "./authorApi";
import { assertWhiteboardElementVersions } from "./versions";
import { createElement, Fragment } from "react";
import { ElementControls, ElementInteraction } from "./ElementInteraction";
import type { CommonElement } from "../plugins/CommonPlugin";
import { resolveSketch, isSketchableType } from "../utils/sketch/resolve";
import { WhiteboardAPIContext as APIContext } from "./context";
import { ErrorBoundary, isEditableTarget } from "@tau/ui";
import { createServiceRegistry, type ServiceRegistry } from "@tau/shared/service-registry";
import type Board from "../Board";
import { BoardUtil } from "../utils/BoardUtil";
import { PathUtil } from "../utils/PathUtil";
import { PointUtil } from "../utils/PointUtil";
import type {
  ElementCreateSpec,
  CreateBuildContext,
  CreatePointerContext,
  CustomCreateGesture,
  WhiteboardAPI,
  WhiteboardCommand,
  WhiteboardContributions,
  WhiteboardElementDefinition,
  WhiteboardExtension,
  WhiteboardExtensionError,
} from "./api";
import { createInternalPlugins, type InternalContributions } from "./internal";
import { registerBoardAccess } from "./access";
import { createSnapshotReader } from "./snapshot";
import { assertEmittableEventName, assertSubscribableEventName } from "./events";
import { createExtensionScope } from "./scope";
import {
  createHotkeyMatcher,
  isReservedHotkey,
  type HotkeyEntry,
  type HotkeyCodeSpec,
} from "./hotkeys";
import { detectHotkeyPlatform, formatHotkey } from "../utils/hotkeyFormat";
import { readDefinitionSchemaVersion, readElementSchemaVersion } from "./elementVersion";
import { SELECT_TOOL_ID } from "../constants/tools";
import { collectChangedElementProblems, WhiteboardValidationError } from "./validation";
import { UnknownElement } from "../components/UnknownElement";
import {
  CONTAINER_KINDS,
  ContainmentBehavior,
  type IElementCapabilities,
} from "../types/capabilities";
import type {
  IBoardPlugin,
  PluginContextMenuItem,
  ContextMenuContext,
  BoardElement,
  ElementBounds,
} from "../types/board";

/** 与 Board.getBounds 的默认包围盒一致：按 x/y/width/height 计算 */
function defaultBounds(node: BoardElement): ElementBounds | null {
  const { x, y, width, height } = node as BoardElement & {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  if (
    typeof x === "number" &&
    typeof y === "number" &&
    typeof width === "number" &&
    typeof height === "number"
  ) {
    return { minX: x, minY: y, maxX: x + width, maxY: y + height };
  }
  return null;
}

/** 读内部 creators 通道（内置扩展为内部插件元素类型登记的创建规格；公共贡献无此字段） */
function readCreators(value: WhiteboardContributions): Record<string, ElementCreateSpec> {
  return (value as InternalContributions).creators ?? {};
}

/** 读内部键码快捷键通道（shift+数字等 event.key 随布局漂移的组合；仅 tau 扩展可声明） */
function readHotkeyCodes(
  value: WhiteboardContributions
): readonly (HotkeyCodeSpec & { command: string })[] {
  return (value as InternalContributions).hotkeyCodes ?? [];
}

const isPositiveSizePair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(item => typeof item === "number" && Number.isFinite(item) && item > 0);

/** 装配期校验元素的 create 规格；返回中文错误信息表示不通过 */
function inspectCreateSpec(type: string, spec: ElementCreateSpec | undefined): string | undefined {
  if (spec === undefined) return `元素 ${type} 未声明 create 规格`;
  if (spec.constrain !== undefined && !["box", "line"].includes(spec.constrain))
    return `元素 ${type} 的 create.constrain 只支持 "box" 或 "line"：${String(spec.constrain)}`;
  if (spec.defaultSize !== undefined && !isPositiveSizePair(spec.defaultSize))
    return `元素 ${type} 的 create.defaultSize 必须为正数二元组`;
  if (spec.minSize !== undefined && !isPositiveSizePair(spec.minSize))
    return `元素 ${type} 的 create.minSize 必须为正数二元组`;
  const gesture = spec.gesture;
  if (gesture === "click") {
    if (spec.defaultSize === undefined)
      return `元素 ${type} 的 click 手势必须声明 create.defaultSize`;
    if (typeof spec.build !== "function") return `元素 ${type} 的 click 手势必须提供 create.build`;
  } else if (gesture === "drag") {
    if (typeof spec.build !== "function") return `元素 ${type} 的 drag 手势必须提供 create.build`;
  } else if (
    typeof gesture !== "object" ||
    gesture === null ||
    typeof gesture.begin !== "function"
  ) {
    return `元素 ${type} 的 create.gesture 必须是 "click"、"drag" 或带 begin 的自定义手势`;
  }
  return undefined;
}

/** 与 Board.moveElement 的无插件兜底一致：只平移 x/y，子元素按各自插件递归移动 */
function genericMove(board: Board, node: BoardElement, dx: number, dy: number): BoardElement {
  return {
    ...node,
    ...(Number.isFinite(node.x) ? { x: node.x + dx } : {}),
    ...(Number.isFinite(node.y) ? { y: node.y + dy } : {}),
    ...(node.children
      ? { children: node.children.map(child => board.moveElement(child, dx, dy) ?? child) }
      : {}),
  } as BoardElement;
}

export class ExtensionRuntime {
  readonly entries: { id: string; api: WhiteboardAPI; value: WhiteboardContributions }[] = [];
  readonly api: WhiteboardAPI;
  private readonly board: Board;
  private cleanups: (() => void)[] = [];
  private active = false;
  private disposed = false;
  private readonly scopes: ReturnType<typeof createExtensionScope>[] = [];
  private readonly authorOwners = new Map<string, string>();
  private readonly authorTypes = new Set<string>();
  private readonly owners = new Map<string, string>();
  private readonly rejectedErrors: WhiteboardExtensionError[] = [];
  /** 已装配扩展声明的元素定义（含版本与迁移函数），type → 定义 */
  private readonly elementDefinitions = new Map<string, WhiteboardElementDefinition>();
  /** 创建型工具 id → 元素 type（工具与元素同扩展装配校验） */
  private readonly createTools = new Map<string, string>();
  /** 工具 id → 所属扩展 id（「扩展工具」菜单显示"来自 {name}"用） */
  private readonly toolOwners = new Map<string, string>();
  /** 扩展 id → 展示名（WhiteboardExtension.name） */
  private readonly extensionNames = new Map<string, string>();
  /** create 成功后被拒的扩展声明的元素 type → 扩展 id（用于占位原因 "disabled"） */
  private readonly rejectedTypeOwners = new Map<string, string>();
  /** 快捷键条目：tau 扩展在前（内置键优先），其余按装配顺序，同一扩展内按声明顺序 */
  private readonly hotkeyEntries: HotkeyEntry[] = [];
  private readonly menuActions = new Map<
    string,
    { owner: string; run: PluginContextMenuItem["onSelect"] }
  >();

  getRejectedExtensions(): readonly WhiteboardExtensionError[] {
    return this.rejectedErrors;
  }

  /** 扩展展示名（未声明或已禁用的扩展返回 undefined） */
  getExtensionName(id: string): string | undefined {
    return this.extensionNames.get(id);
  }

  ownerOf(type: string) {
    return this.owners.get(type) ?? type;
  }

  /** 工具所属扩展 id；未注册或已被禁用的工具返回 undefined */
  toolOwner(toolId: string): string | undefined {
    return this.toolOwners.get(toolId);
  }
  beginMenu() {
    this.menuActions.clear();
  }
  registerMenu(type: string, items: PluginContextMenuItem[]): PluginContextMenuItem[] {
    const owner = this.ownerOf(type);
    return items.map(item => {
      const id = `${owner}.${type}.menu.${item.key}`;
      const children = this.board.children;
      const selection = this.board.selection;
      const canSubmit = this.board.captureSubmission();
      const action = {
        owner,
        run: (context: ContextMenuContext) => {
          if (
            !canSubmit() ||
            this.board.children !== children ||
            this.board.selection !== selection
          )
            return;
          return item.onSelect(context);
        },
      };
      this.menuActions.set(id, action);
      return {
        ...item,
        children: item.children ? this.registerMenu(type, item.children) : undefined,
        onSelect: context => {
          if (this.menuActions.get(id) !== action) return;
          void this.execute(id, context).catch(() => {});
        },
      };
    });
  }

  constructor(
    board: Board,
    extensions: readonly WhiteboardExtension[],
    onExtensionError?: (error: WhiteboardExtensionError) => void,
    services: ServiceRegistry = createServiceRegistry(),
    extensionServices?: (id: string, api: WhiteboardAPI) => ServiceRegistry
  ) {
    if (!Array.isArray(extensions)) throw new TypeError("白板扩展集合必须是数组");
    this.board = board;
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
      getSketch: (element, owner) =>
        resolveSketch(board.sketch, element, owner, this.supportsSketch(element.type)),
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
      get readonlyReason() {
        return board.readonlyReason;
      },
      get isDestroyed() {
        return board.isDestroyed;
      },
      get activeTool() {
        return board.activeTool;
      },
      get activeToolOptions() {
        return board.activeToolOptions;
      },
      setActiveTool: (id, options) => board.setActiveTool(id, options),
      onActiveToolChange: listener => {
        const onToolChange = (id: string, options: Readonly<Record<string, unknown>> | null) => {
          listener(id, options);
        };
        board.on("active-tool:change", onToolChange);
        return () => {
          board.off("active-tool:change", onToolChange);
        };
      },
      screenToCanvas: point => {
        const result = PointUtil.screenToViewPort(board, point.x, point.y);
        if (!result) throw new Error("白板容器尚未挂载，无法转换屏幕坐标");
        return result;
      },
      canvasToScreen: point => {
        const result = PointUtil.viewPortToScreen(board, point.x, point.y);
        if (!result) throw new Error("白板容器尚未挂载，无法转换画布坐标");
        return result;
      },
      getElement: (id: string) => {
        const element = BoardUtil.getElementById(board, id);
        return element ? clone(element) : undefined;
      },
      canContain: (containerType, element) =>
        board.capabilityService.canBeContainedByType(element, containerType),
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
      getShortcut: commandId => this.getShortcut(commandId),
      flashElement: id => board.emit("element:flash", id),
      // 服务访问只经扩展作用域提供（scope 内按声明过滤），主 api 不承载宿主服务
      getService: id => {
        throw new Error(`主 API 不提供宿主服务访问：${id.id}`);
      },
      tryGetService: id => {
        throw new Error(`主 API 不提供宿主服务访问：${id.id}`);
      },
      on: (event: string, listener: (...args: any[]) => void) => {
        assertSubscribableEventName(event);
        let group = listeners.get(event);
        if (!group) listeners.set(event, (group = new Map()));
        if (group.has(listener)) return;
        const wrapped = (...args: any[]) =>
          listener(
            ...([
              "value:change",
              "selection:change",
              "viewport:change",
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
      // 主 API 只在包内使用（WhiteboardAPIProvider 兜底与 createWhiteboardSession 暴露），
      // 包内扩展均属 tau 命名空间，emit 只允许 tau. 前缀，防止冒充其它命名空间
      emit: (event: string, ...args: unknown[]) => {
        assertEmittableEventName(event, "tau");
        board.emit(event, ...args);
      },
    } satisfies WhiteboardAPI);
    registerBoardAccess(this.api, board);

    // 扩展装配：逐个“先校验后提交”，任一扩展校验失败只禁用该扩展（清理其 scope 后继续装配下一个）；
    // 只有 extensions 非数组这类编程错误才抛出。
    const extensionIds = new Set<string>();
    const elementTypeOwners = new Map<string, string>();
    const commandOwners = new Map<string, string>();
    const contributionOwners = new Map<string, string>();
    const inspectorOwners = new Map<string, string>();
    const rejected = this.rejectedErrors;
    const isReservedNamespace = (ns: string) => ns === "tau";
    const report = (error: WhiteboardExtensionError) => {
      rejected.push(error);
      console.error(`白板扩展 ${error.extensionId} 已禁用：${error.message}`);
      onExtensionError?.(error);
    };
    interface Assembled {
      id: string;
      value: WhiteboardContributions;
      scope: ReturnType<typeof createExtensionScope>;
      plugins: IBoardPlugin[];
      types: string[];
      commands: string[];
      contributions: string[];
      inspectors: string[];
    }
    const assembled: Assembled[] = [];

    for (const extension of extensions) {
      const id = extension?.id;
      if (typeof id !== "string" || !/^[a-z0-9-]+\..+/.test(id)) {
        report({
          extensionId: typeof id === "string" ? id : String(extension),
          reason: "invalid-namespace",
          message: `白板扩展 ID 必须形如 <命名空间>.<名称>（命名空间仅限小写字母、数字与连字符）：${String(id)}`,
        });
        continue;
      }
      if (extensionIds.has(id)) {
        report({
          extensionId: id,
          reason: "duplicate-extension",
          message: `重复白板注册：${id}`,
          conflictWith: id,
        });
        continue;
      }
      if (extension.apiVersion !== 1) {
        report({
          extensionId: id,
          reason: "unsupported-api-version",
          message: `不支持的白板扩展版本：${id}`,
        });
        continue;
      }
      const elements: readonly WhiteboardElementDefinition<any>[] = extension.elements ?? [];
      if (!Array.isArray(elements)) {
        report({ extensionId: id, reason: "invalid-definition", message: "静态元素必须为数组" });
        continue;
      }
      const authorOwner = whiteboardAuthorOwner(extension);
      const namespace = authorOwner ?? id.slice(0, id.indexOf("."));
      const reserved = authorOwner === undefined && isReservedNamespace(namespace);
      let scopedServices = services;
      const scope = createExtensionScope(
        this.api,
        whiteboardAuthorOwner(extension) ?? id,
        {
          registry: {
            get: identifier => scopedServices.get(identifier),
            tryGet: identifier => scopedServices.tryGet(identifier),
            has: identifier => scopedServices.has(identifier),
          },
        },
        authorOwner !== undefined
      );
      let value: WhiteboardContributions;
      try {
        registerBoardAccess(scope.api, board);
        scopedServices = extensionServices?.(id, scope.api) ?? services;
        value = extension.create(scope.api);
        if (!value || "elements" in value) {
          if (value) this.guard(id, () => value.dispose?.());
          throw new Error("元素必须在扩展顶层静态声明");
        }
      } catch (error) {
        scope.dispose();
        report({
          extensionId: id,
          reason: "create-failed",
          message: `白板扩展 ${id} 创建失败：${error instanceof Error ? error.message : String(error)}`,
        });
        continue;
      }

      // 以下校验只写局部集合，全部通过后才提交进全局 owners，失败则整体禁用该扩展
      const ownedTypes = new Set<string>();
      const ownedCommands = new Set<string>();
      const ownedContributions = new Set<string>();
      const ownedInspectors = new Set<string>();
      const internalPlugins: IBoardPlugin[] = [];
      const invalid = (message: string, target?: string): WhiteboardExtensionError => ({
        extensionId: id,
        reason: "invalid-namespace",
        message,
        target,
      });
      const invalidDefinition = (message: string, target?: string): WhiteboardExtensionError => ({
        extensionId: id,
        reason: "invalid-definition",
        message,
        target,
      });
      const clash = (target: string, conflictWith?: string): WhiteboardExtensionError => ({
        extensionId: id,
        reason: "conflict",
        message: `重复白板注册：${target}`,
        target,
        conflictWith,
      });
      const typeAllowed = (type: string) =>
        reserved
          ? !type.includes(".") || type.startsWith(`${namespace}.`)
          : type.startsWith(`${namespace}.`);
      const inspect = (): WhiteboardExtensionError | undefined => {
        for (const element of elements) {
          const type = element?.type;
          if (typeof type !== "string" || !typeAllowed(type))
            return invalid(
              reserved
                ? `扩展 ${id} 的元素类型必须是无点裸名或以 "${namespace}." 开头：${String(type)}`
                : `扩展 ${id} 的元素类型必须以 "${namespace}." 开头：${String(type)}`,
              type
            );
          if (ownedTypes.has(type)) return clash(type);
          const existing = elementTypeOwners.get(type);
          if (existing) return clash(type, existing);
          if (
            element.presentation &&
            (!element.presentation.label?.trim() ||
              (element.presentation.getName !== undefined &&
                typeof element.presentation.getName !== "function"))
          )
            return invalidDefinition("元素展示元信息无效", type);
          if (element.sketch !== undefined && element.sketch !== true)
            return invalidDefinition("sketch 只能声明为 true", type);
          if (element.schematic !== undefined && typeof element.schematic !== "function")
            return invalidDefinition("schematic 必须为纯投影函数", type);
          const interaction = element.interaction;
          if (
            interaction &&
            ((interaction.connect !== undefined && interaction.connect !== "rect") ||
              (interaction.resize?.handles !== undefined &&
                !["corners", "all"].includes(interaction.resize.handles)) ||
              (interaction.resize?.preserveAspectRatio !== undefined &&
                typeof interaction.resize.preserveAspectRatio !== "boolean"))
          )
            return invalidDefinition("元素交互声明无效", type);
          try {
            assertWhiteboardElementVersions(element);
          } catch (error) {
            return invalidDefinition(String(error), type);
          }
          const version = element.schemaVersion;
          if (
            version !== undefined &&
            (typeof version !== "number" || !Number.isInteger(version) || version < 1)
          )
            return invalidDefinition(
              `扩展 ${id} 的元素 ${type} 的 schemaVersion 必须是正整数：${String(version)}`,
              type
            );
          for (const kind of element.containment?.joins ?? []) {
            if (!CONTAINER_KINDS.includes(kind))
              return invalidDefinition(
                `扩展 ${id} 的元素 ${type} 的 containment.joins 含未知容器类别：${String(kind)}`,
                type
              );
          }
          ownedTypes.add(type);
        }
        for (const command of value.commands ?? []) {
          const commandId = command?.id;
          if (typeof commandId !== "string" || !commandId.includes("."))
            return invalid(`白板命令 ID 缺少命名空间：${String(commandId)}`, commandId);
          if (!reserved && !commandId.startsWith(`${namespace}.`))
            return invalid(`扩展 ${id} 的命令必须以 "${namespace}." 开头：${commandId}`, commandId);
          if (ownedCommands.has(commandId)) return clash(commandId);
          const existing = commandOwners.get(commandId);
          if (existing) return clash(commandId, existing);
          ownedCommands.add(commandId);
        }
        // 快捷键：键串必须可解析且不得占用宿主应用保留键（tau 扩展同样受限），
        // 同一扩展内不得重复声明同一 key + command
        const declaredHotkeys = new Set<string>();
        for (const hotkey of value.hotkeys ?? []) {
          const key = hotkey?.key;
          if (typeof key !== "string")
            return invalidDefinition(
              `扩展 ${id} 的快捷键 key 必须是字符串：${String(key)}`,
              String(key)
            );
          if (!createHotkeyMatcher(key))
            return invalidDefinition(`无法解析的快捷键键串：${key}`, key);
          if (isReservedHotkey(key))
            return invalidDefinition(`快捷键 ${key} 保留给宿主应用，扩展不能声明`, key);
          const pair = `${key}→${hotkey.command}`;
          if (declaredHotkeys.has(pair))
            return invalidDefinition(`扩展 ${id} 重复声明快捷键 ${key} → ${hotkey.command}`, key);
          declaredHotkeys.add(pair);
        }
        for (const hotkey of readHotkeyCodes(value)) {
          if (!reserved)
            return invalidDefinition(
              `扩展 ${id} 不能声明键码快捷键（仅内置扩展使用）：${String(hotkey?.code)}`,
              hotkey?.command
            );
          if (!createHotkeyMatcher(hotkey))
            return invalidDefinition(
              `扩展 ${id} 的键码快捷键形态不合法：${JSON.stringify(hotkey)}`,
              hotkey?.command
            );
          const pair = `${hotkey.code}${hotkey.shift ? "+shift" : ""}→${hotkey.command}`;
          if (declaredHotkeys.has(pair))
            return invalidDefinition(`扩展 ${id} 重复声明快捷键条目 ${pair}`, hotkey.command);
          declaredHotkeys.add(pair);
        }
        for (const tool of value.tools ?? []) {
          if (typeof tool?.label !== "string" || !tool.label.trim())
            return invalidDefinition(
              `扩展 ${id} 的工具 ${tool?.id} 缺少 label（工具提示与菜单项需要它）`
            );
          const icon = tool?.icon;
          if ((typeof icon !== "function" && typeof icon !== "object") || icon === null)
            return invalidDefinition(`扩展 ${id} 的工具 ${tool?.id} 缺少 icon（工具菜单项需要它）`);
          const hasCommand = tool?.command !== undefined;
          if (
            tool.panel !== undefined &&
            (tool.panel === null || !["function", "object"].includes(typeof tool.panel))
          )
            return invalidDefinition(`扩展 ${id} 的工具 ${tool.id} 的 panel 必须是组件`);
          const elementType = tool?.element;
          const hasElement = elementType !== undefined;
          if (hasCommand === hasElement)
            return invalidDefinition(
              `扩展 ${id} 的工具 ${tool?.id} 的 command 与 element 必须恰好提供一个`
            );
          if (!hasElement) continue;
          // 创建型工具的 element 必须是本扩展声明且带 create 的元素类型，或登记在内部 creators 通道
          const definition = elements.find(item => item?.type === elementType);
          const creatorSpec = readCreators(value)[elementType];
          if (!definition && creatorSpec === undefined)
            return invalidDefinition(
              `扩展 ${id} 的工具 ${tool.id} 的 element ${elementType} 不是本扩展声明的元素类型`,
              elementType
            );
          const createProblem = inspectCreateSpec(elementType, definition?.create ?? creatorSpec);
          if (createProblem) return invalidDefinition(createProblem, elementType);
        }
        for (const contribution of [
          ...(value.tools ?? []),
          ...(value.layers ?? []),
          ...(value.menus ?? []),
          ...(value.ingest ?? []),
        ]) {
          const contributionId = contribution?.id;
          if (
            typeof contributionId !== "string" ||
            (!reserved && !contributionId.startsWith(`${namespace}.`))
          )
            return invalid(
              `扩展 ${id} 的贡献 ID 必须以 "${namespace}." 开头：${String(contributionId)}`,
              contributionId
            );
          if (ownedContributions.has(contributionId)) return clash(contributionId);
          const existing = contributionOwners.get(contributionId);
          if (existing) return clash(contributionId, existing);
          ownedContributions.add(contributionId);
        }
        internalPlugins.push(...createInternalPlugins(extension, board, scope.api));
        for (const plugin of internalPlugins) {
          const name = plugin?.name;
          if (typeof name !== "string") return invalid(`扩展 ${id} 的内部插件缺少名称`, name);
          if (ownedTypes.has(name)) continue; // 与本扩展声明的元素 type 同名，共用一个注册
          if (!typeAllowed(name))
            return invalid(
              reserved
                ? `扩展 ${id} 的元素类型必须是无点裸名或以 "${namespace}." 开头：${name}`
                : `扩展 ${id} 的元素类型必须以 "${namespace}." 开头：${name}`,
              name
            );
          const existing = elementTypeOwners.get(name);
          if (existing) return clash(name, existing);
          ownedTypes.add(name);
        }
        // 内部 creators 通道：key 必须是本扩展（公共元素或内部插件）提供的类型，规格走同一校验
        for (const [type, spec] of Object.entries(readCreators(value))) {
          if (elements.some(element => element?.type === type))
            return invalidDefinition(
              `扩展 ${id} 的 creators 键 ${type} 已是公共元素定义，应改用 element.create 声明`,
              type
            );
          if (!ownedTypes.has(type))
            return invalidDefinition(
              `扩展 ${id} 的 creators 键 ${type} 不是本扩展内部插件提供的元素类型`,
              type
            );
          const createProblem = inspectCreateSpec(type, spec);
          if (createProblem) return invalidDefinition(createProblem, type);
        }
        for (const key of Object.keys(value.inspectors ?? {})) {
          if (!reserved && !key.startsWith(`${namespace}.`) && !ownedTypes.has(key))
            return invalid(
              `扩展 ${id} 的检视器键必须是本扩展声明的元素类型或以 "${namespace}." 开头：${key}`,
              key
            );
          if (ownedInspectors.has(key)) return clash(key);
          const existing = inspectorOwners.get(key);
          if (existing) return clash(key, existing);
          ownedInspectors.add(key);
        }
        return undefined;
      };
      let failure: WhiteboardExtensionError | undefined;
      try {
        failure = inspect();
      } catch (error) {
        failure = {
          extensionId: id,
          reason: "create-failed",
          message: `白板扩展 ${id} 贡献无法装配：${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (failure) {
        this.guard(id, () => value.dispose?.());
        scope.dispose();
        // create 已成功，扩展声明过的元素 type 可知：记录归属，供占位原因 "disabled" 使用
        for (const type of [
          ...elements
            .map(element => element?.type)
            .filter((type): type is string => typeof type === "string"),
          ...internalPlugins
            .map(plugin => plugin?.name)
            .filter((name): name is string => typeof name === "string"),
        ])
          this.rejectedTypeOwners.set(type, id);
        report(failure);
        continue;
      }
      extensionIds.add(id);
      if (authorOwner) this.authorOwners.set(id, authorOwner);
      if (extension.name) this.extensionNames.set(id, extension.name);
      for (const type of ownedTypes) elementTypeOwners.set(type, id);
      for (const command of ownedCommands) commandOwners.set(command, id);
      for (const contribution of ownedContributions) contributionOwners.set(contribution, id);
      for (const inspector of ownedInspectors) inspectorOwners.set(inspector, id);
      for (const element of elements) {
        let definition = element;
        if (authorOwner && element.create) {
          const spec = element.create,
            gesture = spec.gesture;
          definition = {
            ...element,
            create: {
              ...spec,
              build:
                spec.build &&
                ((context: CreateBuildContext) => spec.build!({ ...context, api: scope.api })),
              gesture:
                typeof gesture === "string"
                  ? gesture
                  : {
                      begin(context: Parameters<CustomCreateGesture["begin"]>[0]) {
                        const session = gesture.begin({ ...context, api: scope.api });
                        if (!session) return null;
                        return {
                          move: (value: CreatePointerContext) =>
                            session.move({ ...value, api: scope.api }),
                          end: (value: CreatePointerContext & { moved: boolean }) =>
                            session.end({ ...value, api: scope.api }),
                          cancel: () => session.cancel?.(),
                        };
                      },
                    },
            },
          };
        }
        this.elementDefinitions.set(element.type, definition);
        if (whiteboardAuthorOwner(extension)) this.authorTypes.add(element.type);
      }
      // creators 通道并入同一注册表：伪定义只承载 create（渲染仍由内部插件负责）
      for (const [type, spec] of Object.entries(readCreators(value)))
        this.elementDefinitions.set(type, { type, render: () => null, create: spec });
      for (const tool of value.tools ?? []) {
        this.toolOwners.set(tool.id, id);
        if (tool.element !== undefined) this.createTools.set(tool.id, tool.element);
      }
      const plugins = [...internalPlugins];
      for (const element of elements) {
        const currentVersion = readDefinitionSchemaVersion(element);
        const interaction = new ElementInteraction(element.type);
        const resolved = (node: BoardElement) => {
          if (
            this.authorTypes.has(node.type) &&
            (board.document || element.dataVersion !== undefined)
          )
            return typeof node.contractId === "string"
              ? board.document?.resolveElementDefinition?.(node.contractId)
              : undefined;
          return readElementSchemaVersion(node) === currentVersion
            ? { element, access: "edit" as const }
            : undefined;
        };
        const isVersionCompatible = (node: BoardElement) => {
          const entry = resolved(node);
          return entry !== undefined && entry.access !== "none";
        };
        const canInteract = (node: BoardElement) => resolved(node)?.access === "edit";
        // 声明了 containment 才提供能力：第三方元素只能声明子元素一侧，
        // 版本不兼容（占位渲染）时收纳能力不随渲染降级
        const containmentSpec = element.containment;
        const declaredCapabilities: IElementCapabilities | undefined = containmentSpec
          ? {
              containment: {
                asContainer: ContainmentBehavior.None,
                canBeContained: containmentSpec.canBeContained ?? true,
                joins: containmentSpec.joins,
              },
            }
          : undefined;
        // 版本不兼容（数据比扩展新，或版本不匹配停在旧版本）时按占位渲染，不调用作者实现
        plugins.push({
          name: element.type,
          render: (_board, props) =>
            isVersionCompatible(props.element)
              ? createElement(
                  Fragment,
                  null,
                  createElement(
                    APIContext,
                    {
                      value:
                        resolved(props.element)!.access === "read" ? scope.readonlyAPI : scope.api,
                    },
                    createElement(resolved(props.element)!.element.render, {
                      ...props,
                      element: readSnapshot(props.element),
                    })
                  ),
                  resolved(props.element)?.element.interaction && canInteract(props.element)
                    ? createElement(ElementControls, {
                        element: props.element as CommonElement,
                        options: resolved(props.element)!.element.interaction!,
                        adapter: interaction,
                      })
                    : null
                )
              : createElement(
                  UnknownElement,
                  {
                    element: props.element,
                    extensionId: id,
                    reason:
                      readElementSchemaVersion(props.element) > currentVersion
                        ? ("too-new" as const)
                        : ("unsupported-version" as const),
                  },
                  props.children
                ),
          getCapabilities: declaredCapabilities ? () => declaredCapabilities : undefined,
          getArrowBindPoint: element.interaction?.connect
            ? (board, node, point, offset) =>
                isVersionCompatible(node)
                  ? interaction.getArrowBindPoint(board, node as CommonElement, point, offset)
                  : null
            : undefined,
          getBounds: element.getBounds
            ? (_board, node) =>
                isVersionCompatible(node)
                  ? (resolved(node)!.element.getBounds?.(clone(node)) ?? defaultBounds(node))
                  : defaultBounds(node)
            : undefined,
          isHit: (_board, node, x, y) => {
            if (isVersionCompatible(node)) {
              if (resolved(node)!.element.isHit)
                return resolved(node)!.element.isHit!(clone(node), x, y);
              const box = board.getBounds(node);
              return !!box && x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
            }
            const box = defaultBounds(node);
            return !!box && x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
          },
          moveElement: (_board, node, dx, dy) => {
            if (!canInteract(node)) return genericMove(board, node, dx, dy);
            if (resolved(node)!.element.move)
              return resolved(node)!.element.move!(clone(node), dx, dy);
            return { ...node, x: node.x + dx, y: node.y + dy };
          },
        });
      }
      assembled.push({
        id,
        value,
        scope,
        plugins,
        types: [...ownedTypes],
        commands: [...ownedCommands],
        contributions: [...ownedContributions],
        inspectors: [...ownedInspectors],
      });
    }

    // 引用不存在的命令同样禁用引用方；剔除后其命令不再可被引用，需循环至收敛。
    // 创建型工具（element 字段）没有 command，不参与 missing-command 校验
    const commandRefs = (value: WhiteboardContributions) => [
      ...(value.menus ?? []),
      ...(value.hotkeys ?? []),
      ...readHotkeyCodes(value),
      ...(value.tools ?? []),
    ];
    for (;;) {
      const offender = assembled.find(item =>
        commandRefs(item.value).some(
          ref => ref.command !== undefined && !commandOwners.has(ref.command)
        )
      );
      if (!offender) break;
      const missing = commandRefs(offender.value)
        .map(ref => ref.command)
        .find(command => command !== undefined && !commandOwners.has(command))!;
      assembled.splice(assembled.indexOf(offender), 1);
      offender.types.forEach(type => {
        elementTypeOwners.delete(type);
        this.rejectedTypeOwners.set(type, offender.id);
        this.elementDefinitions.delete(type);
      });
      for (const tool of offender.value.tools ?? []) {
        this.toolOwners.delete(tool.id);
        if (tool.element !== undefined) this.createTools.delete(tool.id);
      }
      offender.commands.forEach(command => commandOwners.delete(command));
      offender.contributions.forEach(contribution => contributionOwners.delete(contribution));
      offender.inspectors.forEach(inspector => inspectorOwners.delete(inspector));
      this.guard(offender.id, () => offender.value.dispose?.());
      offender.scope.dispose();
      report({
        extensionId: offender.id,
        reason: "missing-command",
        message: `未注册白板命令：${missing}`,
        target: missing,
      });
    }

    // 快捷键仲裁序：tau 扩展在前（内置键优先于第三方同键声明），其余按装配顺序；
    // 同一扩展内先公共字符串键、后内部键码键，均保持声明顺序
    const arbitrationOrder = [
      ...assembled.filter(item => item.id.startsWith("tau.")),
      ...assembled.filter(item => !item.id.startsWith("tau.")),
    ];
    this.hotkeyEntries.push(
      ...arbitrationOrder.flatMap((entry, order) => [
        ...(entry.value.hotkeys ?? []).map(hotkey => ({
          key: hotkey.key,
          command: hotkey.command,
          extensionId: entry.id,
          order,
          match: createHotkeyMatcher(hotkey.key)!,
        })),
        ...readHotkeyCodes(entry.value).map(hotkey => ({
          key: `${hotkey.code}${hotkey.shift ? "+shift" : ""}`,
          command: hotkey.command,
          extensionId: entry.id,
          order,
          match: createHotkeyMatcher(hotkey)!,
        })),
      ])
    );

    for (const { id, value, scope, plugins } of assembled) {
      scope.enableWrites();
      this.scopes.push(scope);
      this.entries.push({ id, api: scope.api, value });
      const api = scope.api;
      for (const plugin of plugins) {
        this.owners.set(plugin.name, id);
        const callbacks = new Map<PropertyKey, unknown>();
        board.addPlugin(
          new Proxy(plugin, {
            get(target, property, receiver) {
              const method = Reflect.get(target, property, receiver);
              if (typeof method !== "function") return method;
              if (!callbacks.has(property))
                callbacks.set(property, (...args: unknown[]) => {
                  try {
                    const result = method.apply(target, args);
                    return property === "render" ? (
                      <APIContext value={api}>{result}</APIContext>
                    ) : (
                      result
                    );
                  } catch (error) {
                    console.error(`白板扩展 ${id} 的 ${String(property)} 失败`, error);
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
    }
  }

  /** 渲染 UnknownElement 时的原因判定：未知类型、被拒扩展的元素，或元素版本与定义不兼容 */
  authorOfType(type: string): string | undefined {
    const extension = this.owners.get(type);
    return extension ? this.authorOwners.get(extension) : undefined;
  }
  isHostElement(type: string): boolean {
    return this.owners.has(type) && !this.authorTypes.has(type);
  }
  getElementDefinition(type: string) {
    return this.elementDefinitions.get(type);
  }
  getElementDefinitions() {
    return [...this.elementDefinitions.values()];
  }
  supportsSketch(type: string) {
    return this.elementDefinitions.get(type)?.sketch === true || isSketchableType(type);
  }

  unknownElementReason(
    element: BoardElement
  ):
    | { reason: "missing" | "too-new" | "unsupported-version" | "disabled"; extensionId?: string }
    | undefined {
    const definition = this.elementDefinitions.get(element.type);
    if (
      this.owners.has(element.type) &&
      // 创建预览尚未提交到文档，只按当前扩展定义检查版本。
      element !== this.board.creationPreview?.element &&
      this.board.document?.supportsElement?.(element.id) === false
    )
      return { reason: "too-new", extensionId: this.owners.get(element.type) };
    if (
      this.authorTypes.has(element.type) &&
      !this.board.document &&
      definition?.dataVersion !== undefined
    )
      return { reason: "disabled", extensionId: this.owners.get(element.type) };
    if (this.board.document && this.authorTypes.has(element.type)) {
      const entry =
        typeof element.contractId === "string" &&
        this.board.document.resolveElementDefinition?.(element.contractId);
      return entry && entry.access !== "none"
        ? undefined
        : { reason: "too-new", extensionId: this.owners.get(element.type) };
    }
    if (definition) {
      const version = readElementSchemaVersion(element);
      const current = readDefinitionSchemaVersion(definition);
      if (version === current) return undefined;
      return {
        reason: version > current ? "too-new" : "unsupported-version",
        extensionId: this.owners.get(element.type),
      };
    }
    // 已注册但无版本语义（内置/内部插件承载的类型）不属占位原因四类
    if (this.owners.has(element.type)) return undefined;
    const rejected = this.rejectedTypeOwners.get(element.type);
    return rejected ? { reason: "disabled", extensionId: rejected } : { reason: "missing" };
  }

  /** 命令第一个绑定快捷键的展示文字：hotkeyEntries 已按「tau 优先 + 装配顺序」排列，无绑定返回 null */
  getShortcut(commandId: string): string | null {
    const entry = this.hotkeyEntries.find(item => item.command === commandId);
    return entry ? formatHotkey(entry.key, detectHotkeyPlatform()) : null;
  }

  /**
   * 执行结果校验（在 applyOperations 返回之后、任何状态提交之前调用）：
   * 新旧树按 id 比较元素引用（copy-on-write 保证未改动元素引用不变），引用变化或新增
   * 且带 schema 且版本兼容的元素校验 data——天然覆盖 insert / set / move 混排，不依赖
   * 路径解析。不合规抛 WhiteboardValidationError，调用方尚未提交任何状态，原子性保持。
   */
  validateChangedElements(
    oldChildren: readonly BoardElement[],
    newChildren: readonly BoardElement[]
  ): void {
    if (this.disposed || this.elementDefinitions.size === 0) return;
    const problems = collectChangedElementProblems(
      oldChildren,
      newChildren,
      this.elementDefinitions
    );
    if (problems.length) throw new WhiteboardValidationError(problems);
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

  /** 按命令 id 查找归属扩展与命令定义（装配顺序优先） */
  private findCommand(
    id: string
  ): { owner: string; api: WhiteboardAPI; command: WhiteboardCommand } | undefined {
    for (const entry of this.entries) {
      const command = entry.value.commands?.find(command => command.id === id);
      if (command) return { owner: entry.id, api: entry.api, command };
    }
    return undefined;
  }

  authorOfEvent(event: string): string | undefined {
    let matched: string | undefined;
    for (const owner of this.authorOwners.values())
      if (event.startsWith(`${owner}.`) && (!matched || owner.length > matched.length))
        matched = owner;
    return matched;
  }
  authorOfTool(id: string): string | undefined {
    const owner = this.toolOwners.get(id);
    return owner && this.authorOwners.get(owner);
  }
  async executeFor(owner: string, id: string, payload?: unknown) {
    const command = this.findCommand(id);
    if (!command || this.authorOwners.get(command.owner) !== owner)
      throw new Error("命令不属于此插件");
    return this.execute(id, payload);
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
    const found = this.findCommand(id);
    if (!found) throw new Error(`未注册白板命令：${id}`);
    try {
      if (found.command.enabled && !found.command.enabled(found.api)) return;
      return await found.command.execute(found.api, payload);
    } catch (error) {
      console.error(`白板扩展 ${found.owner} 的命令 ${id} 失败`, error);
      throw error;
    }
  }

  /**
   * 快捷键仲裁：按「tau 优先 + 装配顺序」找全部键匹配的条目，第一条 enabled 的命令
   * 才拦截（preventDefault + stopPropagation）并执行；全部不可用则放行给后续链。
   * 输入法组合、编辑上下文、元素编辑中与演示态整体让位（命令 enabled 仍可自行收紧）。
   */
  onKeyDown(event: KeyboardEvent) {
    if (
      event.isComposing ||
      isEditableTarget(event.target) ||
      this.board.isEditingElements.length > 0 ||
      this.board.presentationManager.isPresentationMode
    )
      return false;
    const matched = this.hotkeyEntries.filter(entry => entry.match(event));
    if (matched.length === 0) return false;
    const winner = matched.find(entry => {
      const found = this.findCommand(entry.command);
      if (!found) return false;
      try {
        return !found.command.enabled || found.command.enabled(found.api);
      } catch (error) {
        console.error(`白板扩展 ${found.owner} 的命令 ${entry.command} enabled 判断失败`, error);
        return false;
      }
    });
    if (!winner) return false;
    event.preventDefault();
    event.stopPropagation();
    // 命令抛错或 rejected Promise 由 execute 内部 console.error，按键已消费不再外溢
    void this.execute(winner.command).catch(() => {});
    return true;
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

  /** 创建型工具查询：id 对应的元素 type 与定义（含 create 规格）；非创建型工具返回 null */
  getCreateTool(
    toolId: string
  ): { elementType: string; definition: WhiteboardElementDefinition } | null {
    const elementType = this.createTools.get(toolId);
    if (elementType === undefined) return null;
    const definition = this.elementDefinitions.get(elementType);
    if (
      this.authorTypes.has(elementType) &&
      definition?.dataVersion !== undefined &&
      !this.board.document
    )
      return null;
    return definition?.create ? { elementType, definition } : null;
  }

  /** 工具点击入口：创建型工具切换激活（同工具无参数时切回选择），命令型工具执行命令 */
  runTool(tool: { id: string; command?: string; element?: string }, payload?: unknown): void {
    if (tool.element !== undefined) {
      if (this.board.activeTool === tool.id && payload === undefined) {
        this.board.setActiveTool(SELECT_TOOL_ID);
      } else {
        this.board.setActiveTool(tool.id, payload as Record<string, unknown> | undefined);
      }
      return;
    }
    if (tool.command !== undefined) void this.execute(tool.command, payload).catch(() => {});
  }
  get layers() {
    return this.entries.flatMap(entry => entry.value.layers ?? []);
  }
  renderToolPanel(toolId: string, run: (payload?: unknown) => void) {
    const entry = this.entries.find(({ value }) => value.tools?.some(tool => tool.id === toolId));
    const Panel = entry?.value.tools?.find(tool => tool.id === toolId)?.panel;
    if (!entry || !Panel) return null;
    return (
      <ErrorBoundary
        key={toolId}
        fallback={<p role="alert">工具面板加载失败，请返回重试。</p>}
        onError={error => console.error(`白板扩展 ${entry.id} 的工具面板失败`, error)}
      >
        <APIContext value={entry.api}>
          <Panel run={run} />
        </APIContext>
      </ErrorBoundary>
    );
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
