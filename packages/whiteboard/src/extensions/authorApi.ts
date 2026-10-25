import { IWhiteboardAuthorPermission } from "./authorAccess";
import { useWhiteboardAPI as useHostAPI } from "./context";
import { defineWhiteboardExtension as defineHostExtension } from "./api";
import type {
  WhiteboardAPI as HostAPI,
  WhiteboardExtension as HostExtension,
  WhiteboardElementDefinition as HostElement,
  WhiteboardContributions as HostContributions,
} from "./api";
import type {
  WhiteboardAPI,
  WhiteboardAuthorBridge,
  WhiteboardElementDefinition,
  WhiteboardExtension,
  WhiteboardContributions,
} from "./authorTypes";
import { assertWhiteboardElementVersions } from "./versions";
const bridges = new WeakMap<
  HostAPI,
  {
    owner: string;
    get: () => WhiteboardAuthorBridge | undefined;
    active: () => boolean;
    handles: Set<import("@tau/editor/text-field-contract").EditorTextField>;
  }
>();
const authorExtensions = new WeakMap<object, string>();
export const whiteboardAuthorOwner = (extension: object) => authorExtensions.get(extension);
const apis = new WeakMap<HostAPI, WhiteboardAPI>();
export function bindWhiteboardAuthorAPI(
  base: HostAPI,
  owner: string,
  get: () => WhiteboardAuthorBridge | undefined,
  active: () => boolean
): () => void {
  const handles = new Set<import("@tau/editor/text-field-contract").EditorTextField>();
  bridges.set(base, { owner, get, active, handles });
  return () => {
    handles.forEach(handle => handle.dispose());
    handles.clear();
  };
}
export function authorAPI(base: HostAPI): WhiteboardAPI {
  const existing = apis.get(base);
  if (existing) return existing;
  const binding = () => {
    const bound = bridges.get(base);
    if (!bound?.active() || base.readonly || !base.captureSubmission()())
      throw new Error("插件作用域已失效或白板只读");
    base.tryGetService(IWhiteboardAuthorPermission)?.assertActive();
    const bridge = bound.get();
    if (!bridge) throw new Error("此写入口要求已绑定的白板协作文档");
    if (!bridge.canWrite()) throw new Error("白板作用域尚未就绪或不可写");
    return { ...bound, bridge };
  };
  const read = () => {
    const value = bridges.get(base)?.get();
    if (!value) throw new Error("白板未绑定协作文档");
    return value;
  };
  const api: Record<string, unknown> = {};
  // 只复制明确的公共能力，不能通过原型取得宿主路径写入口。
  for (const key of [
    "selection",
    "viewPort",
    "readonly",
    "readonlyReason",
    "isDestroyed",
    "activeTool",
    "activeToolOptions",
  ] as const)
    Object.defineProperty(api, key, {
      enumerable: true,
      get: () => {
        if (key !== "readonly") return base[key];
        try {
          base.tryGetService(IWhiteboardAuthorPermission)?.assertActive();
          return base.readonly || !bridges.get(base)?.get()?.canWrite();
        } catch {
          return true;
        }
      },
    });
  for (const key of [
    "setActiveTool",
    "onActiveToolChange",
    "screenToCanvas",
    "canvasToScreen",
    "getSketch",
    "canContain",
    "select",
    "subscribe",
    "execute",
    "getShortcut",
    "flashElement",
    "getService",
    "tryGetService",
    "on",
    "off",
    "emit",
  ] as const)
    api[key] = (...args: unknown[]) => {
      if (!bridges.get(base)?.active()) throw new Error("插件作用域已释放");
      return (base[key] as (...args: unknown[]) => unknown)(...args);
    };
  Object.defineProperty(api, "children", {
    enumerable: true,
    get: () => (api.getSnapshot as WhiteboardAPI["getSnapshot"])().children,
  });
  let snapshotSource: ReturnType<HostAPI["getSnapshot"]> | undefined,
    snapshot: ReturnType<WhiteboardAPI["getSnapshot"]> | undefined;
  Object.assign(api, {
    execute: (command: string, payload?: unknown) => {
      const bound = bridges.get(base);
      if (!bound?.active() || !command.startsWith(`${bound.owner}.`))
        return Promise.reject(new Error("插件不能执行其他作用域的命令"));
      return base.execute(command, payload);
    },
    emit: (event: `${string}.${string}`, ...args: unknown[]) => {
      const bound = bridges.get(base);
      if (!bound?.active() || !event.startsWith(`${bound.owner}.`))
        throw new Error("插件不能冒用事件作用域");
      return base.emit(event, ...args);
    },
    setActiveTool: (id: string, options?: Record<string, unknown>) => {
      const bound = bridges.get(base);
      if (!bound?.active() || (id !== "tau.select" && !id.startsWith(`${bound.owner}.`)))
        throw new Error("工具不属于插件作用域");
      return base.setActiveTool(id, options);
    },
    getSnapshot: () => {
      const source = base.getSnapshot();
      if (source !== snapshotSource) {
        snapshotSource = source;
        snapshot = Object.freeze(read().getSnapshot());
      }
      return snapshot!;
    },
    getElement: (id: string) => read().getElement(id),
    captureSubmission: (target?: string | { id: string }) => {
      const valid = base.captureSubmission(typeof target === "object" ? target.id : target);
      const pageId = bridges.get(base)?.get()?.getPageId();
      return () => {
        try {
          if (
            !bridges.get(base)?.active() ||
            !valid() ||
            !bridges.get(base)?.get()?.canWrite() ||
            bridges.get(base)?.get()?.getPageId() !== pageId
          )
            return false;
          base.tryGetService(IWhiteboardAuthorPermission)?.assertActive();
          return true;
        } catch {
          return false;
        }
      };
    },
    submit: (
      commands: Parameters<WhiteboardAPI["submit"]>[0],
      options?: { historyGroup?: string }
    ) => {
      const value = binding();
      return value.bridge.submit(value.owner, commands, options?.historyGroup);
    },
    updateElement: (id: string, patch: Parameters<WhiteboardAPI["updateElement"]>[1]) => {
      const value = binding();
      if (!value.bridge.getElement(id)) return false;
      value.bridge.submit(value.owner, [{ type: "set_node", id, patch }]);
      return true;
    },
    updateElementData: (
      id: string,
      patch: Parameters<WhiteboardAPI["updateElementData"]>[1],
      options?: { unset?: readonly string[]; historyGroup?: string }
    ) => {
      const value = binding();
      if (!value.bridge.getElement(id)) return false;
      value.bridge.submit(
        value.owner,
        [{ type: "set_data", id, patch, ...(options?.unset ? { unset: options.unset } : {}) }],
        options?.historyGroup
      );
      return true;
    },
    getTextBinding: (id: string, field: string) => {
      const value = bridges.get(base);
      if (!value?.active()) throw new Error("插件作用域已释放");
      const handle = read().getTextBinding(value.owner, id, field);
      value.handles.add(handle);
      const guarded =
        (action: (...args: any[]) => any) =>
        (...args: unknown[]) => {
          binding();
          return action(...args);
        };
      return {
        ...handle,
        edit: guarded(handle.edit),
        editBatch: guarded(handle.editBatch),
        replace: guarded(handle.replace),
        undo: guarded(handle.undo),
        redo: guarded(handle.redo),
        dispose: () => {
          handle.dispose();
          value.handles.delete(handle);
        },
      };
    },
  });
  const result = Object.freeze(api) as unknown as WhiteboardAPI;
  apis.set(base, result);
  return result;
}
export function useWhiteboardAPI(): WhiteboardAPI {
  return authorAPI(useHostAPI());
}
export function defineElement<TData = unknown>(
  definition: WhiteboardElementDefinition<TData>
): WhiteboardElementDefinition<TData> {
  assertWhiteboardElementVersions(definition as unknown as HostElement);
  return definition;
}
/** 作者工厂及回调始终收到受控外观，宿主旧能力不进入作者对象原型。 */
export function defineWhiteboardExtension(
  definition: Omit<WhiteboardExtension, "apiVersion">
): WhiteboardExtension {
  const adapt = (value: WhiteboardContributions): HostContributions => ({
    ...value,
    commands: value.commands?.map(command => ({
      ...command,
      enabled: command.enabled && (api => command.enabled!(authorAPI(api))),
      execute: (api, payload) => command.execute(authorAPI(api), payload),
    })),
    menus: value.menus?.map(menu => ({
      ...menu,
      when: menu.when && (api => menu.when!(authorAPI(api))),
    })),
    ingest: value.ingest?.map(item => ({
      ...item,
      run: (api, event) => item.run(authorAPI(api), event),
    })),
  });
  const elements = definition.elements?.map(element => {
    const spec = element.create;
    if (!spec) return element as unknown as HostElement;
    const check = (node: unknown): import("../types/element").BoardElement | null => {
      if (node === null) return null;
      if (
        !node ||
        typeof node !== "object" ||
        Array.isArray(node) ||
        Object.getPrototypeOf(node) !== Object.prototype ||
        (node as { type?: unknown }).type !== element.type ||
        typeof (node as { id?: unknown }).id !== "string" ||
        Object.keys(node).some(
          key =>
            ![
              "id",
              "type",
              "data",
              "x",
              "y",
              "width",
              "height",
              "rotation",
              "name",
              "style",
            ].includes(key)
        )
      )
        throw new Error("作者创建工具只能返回本类型元素，不能夹带路径操作或宿主字段");
      return structuredClone(node) as import("../types/element").BoardElement;
    };
    const complete = (
      result: unknown,
      valid: () => boolean
    ):
      | import("../types/element").BoardElement
      | null
      | Promise<import("../types/element").BoardElement | null> => {
      if (result && typeof (result as PromiseLike<unknown>).then === "function")
        return Promise.resolve(result).then(value => (valid() ? check(value) : null));
      return valid() ? check(result) : null;
    };
    const gesture = spec.gesture;
    const create: NonNullable<HostElement["create"]> = {
      ...spec,
      build:
        spec.build &&
        (context => {
          const api = authorAPI(context.api),
            valid = api.captureSubmission();
          if (!valid()) return null;
          return complete(spec.build!({ ...context, api }), valid);
        }),
      gesture:
        typeof gesture === "string"
          ? gesture
          : {
              begin(context) {
                const api = authorAPI(context.api),
                  valid = api.captureSubmission();
                if (!valid()) return null;
                const session = gesture.begin({
                  ...context,
                  api,
                  preview: (node, options) =>
                    context.preview(valid() ? check(node) : null, options),
                });
                if (!session) return null;
                return {
                  move: value => {
                    if (valid()) session.move({ ...value, api });
                  },
                  end: value => (valid() ? complete(session.end({ ...value, api }), valid) : null),
                  cancel: () => session.cancel?.(),
                };
              },
            },
    };
    return { ...element, create } as HostElement;
  });
  const extension = defineHostExtension({
    ...definition,
    elements,
    create: api => adapt(definition.create(authorAPI(api))),
  });
  authorExtensions.set(extension, definition.id);
  return extension as unknown as WhiteboardExtension;
}
export function hostWhiteboardExtensions(
  extensions: readonly WhiteboardExtension[],
  owner?: string
): readonly HostExtension[] {
  return extensions.map(extension => {
    const value = authorExtensions.has(extension)
      ? extension
      : defineWhiteboardExtension(extension);
    if (owner && authorExtensions.get(value) !== owner) {
      const scoped = Object.freeze({ ...value });
      authorExtensions.set(scoped, owner);
      return scoped as unknown as HostExtension;
    }
    return value as unknown as HostExtension;
  });
}
