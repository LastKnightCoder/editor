import { create } from "zustand";
import type {
  PluginEntityKind,
  PluginEntityRef,
  PluginPickOptions,
  PluginPickedEntity,
} from "@tau/plugins";
import type { Descendant } from "slate";
import type { AppAdapter, PluginAppRunRequest, PluginOwner } from "@tau/plugins/host";
import { getPluginData, pluginRefExists } from "@/commands/plugin-data";
import { locateEntity } from "@/commands/entity";
import { bindDatabaseCommands } from "@/services/command-context";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import type { EntityCandidate, EntityKind } from "@/types";
import { resolvePluginContentTarget } from "./content-target";

/** 插件类型 → 宿主选择器的实体类型 */
export const PICKER_KINDS: Record<PluginEntityKind, EntityKind> = {
  card: "card",
  article: "article",
  document: "project_item",
  diary: "diary-moment",
  whiteboard: "white_board",
  todo: "todo",
  event: "calendar-event",
};

const OPEN_KINDS: Partial<Record<PluginEntityKind, EntityRef["kind"]>> = {
  card: "card",
  article: "article",
  document: "project-item",
  diary: "diary-moment",
};

/** 选择器的候选 → 插件引用；待办与日程的 id 与 context.data 一致（带创建时间） */
export function pickedEntity(candidate: EntityCandidate): PluginPickedEntity | null {
  const kind = (Object.keys(PICKER_KINDS) as PluginEntityKind[]).find(
    key => PICKER_KINDS[key] === candidate.kind
  );
  if (!kind) return null;
  const id =
    kind === "todo"
      ? `todo:${candidate.id}:${candidate.createdAt}`
      : kind === "event"
        ? `${candidate.id}:${candidate.createdAt}`
        : String(candidate.id);
  return { ref: { kind, id }, title: candidate.title };
}

export interface PluginPickRequest {
  id: number;
  plugin: PluginOwner;
  options: Required<PluginPickOptions>;
  settle(picked: PluginPickedEntity[]): void;
}

/** 选择弹窗由壳层挂载的 PluginEntityPickerHost 渲染，一次只显示一个请求 */
export const usePluginPickerUi = create<{ request: PluginPickRequest | null }>()(() => ({
  request: null,
}));

/** 宿主动作打开的界面（导出窗口、演示、协作窗口），由壳层挂载的 PluginContentActionHost 渲染；新请求替换旧请求 */
export interface PluginActionRequest {
  id: number;
  plugin: PluginOwner;
  action: "export" | "present" | "share";
  format?: "image" | "pdf" | "epub";
  contentId: number;
  source: {
    sourceType: "card" | "article" | "project-item";
    sourceId: number;
    sourceTitle: string;
  };
  title: string;
  content: Descendant[];
  close(): void;
}

export const usePluginActionUi = create<{ request: PluginActionRequest | null }>()(() => ({
  request: null,
}));

let nextRequestId = 0;

/** 选择与打开只响应用户操作：插件在后台或定时器里不能弹出选择器、切换页面 */
function assertUserActivation() {
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
    .userActivation;
  if (activation && !activation.isActive) throw new Error("只能在用户点击或按键后调用");
}

export function createDesktopApp(databaseName: string): AppAdapter {
  return {
    pick(context, plugin, options) {
      assertUserActivation();
      context.signal.throwIfAborted();
      if (usePluginPickerUi.getState().request) throw new Error("已有一个选择窗口正在打开");
      return new Promise(resolve => {
        const finish = (picked: PluginPickedEntity[]) => {
          context.signal.removeEventListener("abort", abort);
          if (usePluginPickerUi.getState().request === request)
            usePluginPickerUi.setState({ request: null });
          resolve(picked);
        };
        const abort = () => finish([]);
        const request: PluginPickRequest = {
          id: ++nextRequestId,
          plugin,
          options,
          settle: finish,
        };
        context.signal.addEventListener("abort", abort, { once: true });
        usePluginPickerUi.setState({ request });
      });
    },
    async open(context, ref: PluginEntityRef) {
      assertUserActivation();
      const commands = bindDatabaseCommands(
        { pluginRefExists, locateEntity },
        { databaseName, signal: context.signal }
      );
      if (!(await commands.pluginRefExists(databaseName, ref.kind, ref.id)))
        throw new Error("内容不存在");
      // 打开依赖导航与各业务查询，按需加载，不拖重插件宿主的启动
      const [{ openEntity }, { openPage }] = await Promise.all([
        import("@/services/open-content"),
        import("@/services/page-navigation"),
      ]);
      context.signal.throwIfAborted();
      const kind = OPEN_KINDS[ref.kind];
      if (kind) return openEntity({ kind, id: Number(ref.id) });
      if (ref.kind === "whiteboard") return openPage("whiteboard-detail", { id: Number(ref.id) });
      if (ref.kind === "event")
        return openPage("schedule", { eventId: Number(ref.id.split(":")[0]) });
      const [key] = ref.id.split("@");
      const todo = /^todo:(\d+):/.exec(key);
      if (todo) return openPage("todos", { selectedId: Number(todo[1]) });
      // 正文里的勾选项：打开所在文档并定位到这一项
      const task = /^document:(\d+):\d+:(.+)$/.exec(key);
      if (!task) throw new Error("内容不存在");
      const location = await commands.locateEntity({ contentId: Number(task[1]) });
      const owner = location ? normalizeEntityRefKind(location.kind) : null;
      if (!location || !owner) throw new Error("内容不存在");
      context.signal.throwIfAborted();
      return openEntity({ kind: owner, id: location.id }, { at: { taskId: task[2] } });
    },
    async run(context, plugin, request: PluginAppRunRequest) {
      assertUserActivation();
      const target = await resolvePluginContentTarget(databaseName, request.ref, context.signal);
      if (!target) throw new Error("内容不存在");
      const record = await bindDatabaseCommands(
        { getPluginData },
        { databaseName, signal: context.signal }
      ).getPluginData(databaseName, target.owner.entity, target.owner.id);
      context.signal.throwIfAborted();
      const title = record?.title || "未命名";
      if (request.action === "content.export" && request.format === "markdown") {
        const { exportContentAsMarkdown } = await import("@/services/content-transfer");
        context.signal.throwIfAborted();
        await exportContentAsMarkdown({ title, content: target.nodes });
        return;
      }
      const close = () => {
        context.signal.removeEventListener("abort", close);
        if (usePluginActionUi.getState().request === next)
          usePluginActionUi.setState({ request: null });
      };
      const next: PluginActionRequest = {
        id: ++nextRequestId,
        plugin,
        action:
          request.action === "content.export"
            ? "export"
            : request.action === "content.present"
              ? "present"
              : "share",
        ...(request.action === "content.export" && request.format !== "markdown"
          ? { format: request.format }
          : {}),
        contentId: target.contentId,
        source: {
          sourceType: target.owner.sourceType,
          sourceId: target.owner.id,
          sourceTitle: title,
        },
        title,
        content: target.nodes,
        close,
      };
      // 插件停用时撤下它打开的界面
      context.signal.addEventListener("abort", close, { once: true });
      usePluginActionUi.getState().request?.close();
      usePluginActionUi.setState({ request: next });
    },
  };
}
