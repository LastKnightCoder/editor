/* eslint-disable react-refresh/only-export-components -- SDK 同时提供作者 hook 与宿主控制器。 */
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export interface SettingsDraftChange {
  label: string;
  /** 已保存的值，用于离开确认里的「旧值 → 新值」 */
  from?: string;
  to?: string;
}

export interface SettingsDraftOptions {
  /** 草稿与已保存的值不同 */
  dirty: boolean;
  /** 填写有误的项数；大于 0 时不能保存 */
  errors?: number;
  /** 修改清单：保存条显示项数，离开确认里逐项列出 */
  changes?: readonly SettingsDraftChange[];
  /** 写入草稿；返回的文字显示在「已保存」旁，抛错时保存条显示错误信息 */
  save(): Promise<string | void> | string | void;
  /** 放弃草稿，回到已保存的值 */
  reset(): void;
  /** 有错误时用户仍点了保存，用来把错误标到字段上 */
  onInvalid?(): void;
  /** 保存按钮文字，默认「保存」 */
  saveLabel?: string;
  /** 保存中的进度文字，默认「正在保存…」 */
  savingText?: string;
}

export interface SettingsDraft {
  readonly saving: boolean;
  /** 与保存条相同的保存，成功返回 true */
  save(): Promise<boolean>;
}

export type SettingsDraftPhase = "idle" | "saving" | "saved" | "failed";
export type SettingsDraftLeaveChoice = "save" | "discard" | "stay";

export interface SettingsDraftSnapshot {
  readonly attached: boolean;
  readonly dirty: boolean;
  readonly errors: number;
  readonly changes: readonly SettingsDraftChange[];
  readonly saveLabel: string;
  readonly savingText: string;
  readonly phase: SettingsDraftPhase;
  /** saved 时为成功说明，failed 时为错误信息 */
  readonly message: string;
  /** 正在询问是否离开 */
  readonly leaving: boolean;
  /** 有错误仍点保存时递增，宿主据此定位到错误字段 */
  readonly invalidAttempts: number;
}

export interface SettingsDraftController {
  getSnapshot(): SettingsDraftSnapshot;
  subscribe(listener: () => void): () => void;
  /** 每个设置分区同一时间只能有一个草稿 */
  attach(options: { readonly current: SettingsDraftOptions }): { update(): void; dispose(): void };
  save(): Promise<boolean>;
  reset(): void;
  /** 有未保存修改时进入询问，按用户选择解析：true 放行离开 */
  confirmLeave(): Promise<boolean>;
  answerLeave(choice: SettingsDraftLeaveChoice): void;
  dispose(): void;
}

const IDLE: SettingsDraftSnapshot = Object.freeze({
  attached: false,
  dirty: false,
  errors: 0,
  changes: Object.freeze([]),
  saveLabel: "保存",
  savingText: "",
  phase: "idle",
  message: "",
  leaving: false,
  invalidAttempts: 0,
});

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sameChanges = (a: readonly SettingsDraftChange[], b: readonly SettingsDraftChange[]) =>
  a.length === b.length &&
  a.every((item, index) => {
    const other = b[index];
    return item.label === other.label && item.from === other.from && item.to === other.to;
  });

/** 宿主为每个设置分区创建一个控制器：保存条、离开确认与快捷键都读它。 */
export function createSettingsDraftController({
  savedDuration = 1200,
}: { savedDuration?: number } = {}): SettingsDraftController {
  let snapshot = IDLE;
  let source: { readonly current: SettingsDraftOptions } | null = null;
  let pendingSave: Promise<boolean> | null = null;
  let leaveResolve: ((leave: boolean) => void) | null = null;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<SettingsDraftSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of [...listeners]) listener();
  };
  const update = () => {
    const options = source?.current;
    if (!options) return;
    const dirty = !!options.dirty;
    const errors = Math.max(0, Math.floor(options.errors ?? 0));
    const changes = dirty ? (options.changes ?? []) : [];
    const saveLabel = options.saveLabel || "保存";
    const savingText = options.savingText ?? "";
    if (
      snapshot.attached &&
      dirty === snapshot.dirty &&
      errors === snapshot.errors &&
      saveLabel === snapshot.saveLabel &&
      savingText === snapshot.savingText &&
      sameChanges(changes, snapshot.changes)
    )
      return;
    // 保存后又改了：「已保存」提示让位给新的修改
    const phase = dirty && snapshot.phase === "saved" ? "idle" : snapshot.phase;
    set({
      attached: true,
      dirty,
      errors,
      changes,
      saveLabel,
      savingText,
      phase,
      ...(phase === "idle" && { message: "" }),
    });
  };
  const resolveLeave = (leave: boolean) => {
    const resolve = leaveResolve;
    leaveResolve = null;
    if (snapshot.leaving) set({ leaving: false });
    resolve?.(leave);
  };

  const controller: SettingsDraftController = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    attach(options) {
      if (source && source !== options) throw new Error("一个设置分区只能有一个草稿");
      source = options;
      update();
      return {
        update: () => {
          if (source === options) update();
        },
        dispose: () => {
          if (source !== options) return;
          source = null;
          clearTimeout(savedTimer);
          resolveLeave(true);
          set(IDLE);
        },
      };
    },
    save() {
      if (pendingSave) return pendingSave;
      const options = source?.current;
      if (!options) return Promise.resolve(false);
      update();
      if (snapshot.errors > 0) {
        options.onInvalid?.();
        set({ invalidAttempts: snapshot.invalidAttempts + 1 });
        return Promise.resolve(false);
      }
      clearTimeout(savedTimer);
      set({ phase: "saving", message: "" });
      const task = (async () => {
        try {
          const text = await options.save();
          if (!source) return true;
          set({ phase: "saved", message: typeof text === "string" ? text : "" });
          savedTimer = setTimeout(() => {
            if (snapshot.phase === "saved") set({ phase: "idle", message: "" });
          }, savedDuration);
          return true;
        } catch (error) {
          if (source) set({ phase: "failed", message: errorText(error) || "保存失败" });
          return false;
        } finally {
          pendingSave = null;
        }
      })();
      pendingSave = task;
      return task;
    },
    reset() {
      source?.current.reset();
      clearTimeout(savedTimer);
      set({ phase: "idle", message: "" });
    },
    confirmLeave() {
      update();
      if (!source || !snapshot.dirty) return Promise.resolve(true);
      if (pendingSave) return pendingSave.then(() => controller.confirmLeave());
      leaveResolve?.(false);
      set({ leaving: true });
      return new Promise(resolve => {
        leaveResolve = resolve;
      });
    },
    answerLeave(choice) {
      if (!leaveResolve) return;
      if (choice === "stay") return resolveLeave(false);
      if (choice === "discard") {
        controller.reset();
        return resolveLeave(true);
      }
      const resolve = leaveResolve;
      leaveResolve = null;
      set({ leaving: false });
      void controller.save().then(resolve);
    },
    dispose() {
      clearTimeout(savedTimer);
      resolveLeave(true);
      listeners.clear();
    },
  };
  return controller;
}

const DraftContext = createContext<SettingsDraftController | null>(null);

export function SettingsDraftProvider({
  controller,
  children,
}: {
  controller: SettingsDraftController;
  children: ReactNode;
}) {
  return createElement(DraftContext.Provider, { value: controller }, children);
}

/** 宿主组件读取所在分区的控制器（如切换账号前询问离开）；不在设置分区内时为 null。 */
export function useSettingsDraftController() {
  return useContext(DraftContext);
}

const noSubscribe = () => () => undefined;
const idleSnapshot = () => IDLE;

/**
 * 插件设置的草稿：组件报告有没有改动、怎么保存、怎么还原，宿主负责保存条、⌘S 与离开确认。
 * 不在宿主的设置分区内（如插件页面）时返回 null，组件需要自己提供保存入口。
 */
export function useSettingsDraft(options: SettingsDraftOptions): SettingsDraft | null {
  const controller = useContext(DraftContext);
  const latest = useRef(options);
  latest.current = options;
  const handle = useRef<{ update(): void } | null>(null);
  useEffect(() => {
    if (!controller) return;
    const attached = controller.attach(latest);
    handle.current = attached;
    return () => {
      handle.current = null;
      attached.dispose();
    };
  }, [controller]);
  useEffect(() => {
    handle.current?.update();
  });
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? noSubscribe,
    controller?.getSnapshot ?? idleSnapshot,
    controller?.getSnapshot ?? idleSnapshot
  );
  const saving = snapshot.phase === "saving";
  return useMemo(
    () => (controller ? { saving, save: controller.save } : null),
    [controller, saving]
  );
}
