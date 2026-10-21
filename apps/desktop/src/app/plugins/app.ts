import { create } from "zustand";
import type {
  PluginContext,
  PluginEntityKind,
  PluginEntityRef,
  PluginPickOptions,
  PluginPickedEntity,
} from "@tau/plugins";
import type { Descendant } from "slate";
import type { AppAdapter, PluginAppRunRequest, PluginOwner } from "@tau/plugins/host";
import {
  describePluginRefs,
  getPluginData,
  grantPluginRefs,
  pluginRefExists,
  resolvePluginContentInput,
} from "@/commands/plugin-data";
import { DEFAULT_CARD_CONTENT } from "@/constants/card";
import { getChatSession } from "@/commands/chat-session";
import { locateEntity } from "@/commands/entity";
import { bindDatabaseCommands } from "@/services/command-context";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import type { EntityCandidate, EntityKind } from "@/types";
import { resolvePluginContentTarget } from "./content-target";
import { toContentSource } from "./data";
import { assertPluginUserActivation } from "./user-activation";

/** 插件类型 → 宿主选择器的实体类型；材料一类对应划线、PDF 标注与剪藏 */
export const PICKER_KINDS: Record<PluginEntityKind, EntityKind[]> = {
  card: ["card"],
  article: ["article"],
  document: ["project_item"],
  diary: ["diary-moment"],
  whiteboard: ["white_board"],
  todo: ["todo"],
  event: ["calendar-event"],
  project: ["project"],
  notebook: ["notebook"],
  material: ["excerpt", "pdf-annotation", "web-clip"],
  "chat-session": ["chat-session"],
  "plugin-entity": ["plugin-entity"],
};

const OPEN_KINDS: Partial<Record<PluginEntityKind, EntityRef["kind"]>> = {
  card: "card",
  article: "article",
  document: "project-item",
  diary: "diary-moment",
  "plugin-entity": "plugin-entity",
};

const OPEN_PAGES: Partial<Record<PluginEntityKind, string>> = {
  whiteboard: "whiteboard-detail",
  project: "project-detail",
  notebook: "vibe-learning-detail",
};

/**
 * 选择器的候选 → 插件引用：待办与日程的 id 与 context.data 一致（带创建时间），
 * 材料为 `类型:ID`，对话为会话 ID
 */
export function pickedEntity(candidate: EntityCandidate): PluginPickedEntity | null {
  const kind = (Object.keys(PICKER_KINDS) as PluginEntityKind[]).find(key =>
    PICKER_KINDS[key].includes(candidate.kind)
  );
  if (!kind) return null;
  const id =
    kind === "todo"
      ? `todo:${candidate.id}:${candidate.createdAt}`
      : kind === "event"
        ? `${candidate.id}:${candidate.createdAt}`
        : kind === "material"
          ? `${candidate.kind}:${candidate.id}`
          : kind === "chat-session"
            ? (candidate.sessionId ?? "")
            : String(candidate.id);
  return id ? { ref: { kind, id }, title: candidate.title } : null;
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

interface PluginActionBase {
  id: number;
  plugin: PluginOwner;
  /** 用户关闭界面；新建类按取消处理 */
  close(): void;
}

/**
 * 宿主动作打开的界面（导出窗口、演示、协作窗口、新建卡片），由壳层挂载的 PluginContentActionHost
 * 渲染；一次只显示一个，界面关闭后插件的 run 才返回。
 */
export type PluginActionRequest = PluginContentActionRequest | PluginCardCreateRequest;

export interface PluginCardCreateRequest extends PluginActionBase {
  action: "card.create";
  /** 预填的正文与标签：不读写用户的卡片草稿 */
  content: Descendant[];
  tags: string[];
  settle(cardId: number): void;
}

export interface PluginContentActionRequest extends PluginActionBase {
  action: "export" | "present" | "share";
  format?: "image" | "pdf" | "epub";
  contentId: number;
  source: {
    sourceType: "card" | "article" | "project-item" | "content";
    sourceId: number;
    sourceTitle: string;
  };
  title: string;
  content: Descendant[];
}

export const usePluginActionUi = create<{ request: PluginActionRequest | null }>()(() => ({
  request: null,
}));

let nextRequestId = 0;

/** 显示动作界面，界面关闭或插件停用后以 fallback 结束 */
function showAction<T>(
  context: PluginContext,
  fallback: T,
  build: (finish: (value: T) => void, id: number) => PluginActionRequest
): Promise<T> {
  context.signal.throwIfAborted();
  if (usePluginActionUi.getState().request) throw new Error("请先完成或关闭当前打开的窗口");
  return new Promise(resolve => {
    let done = false;
    const finish = (value: T) => {
      if (done) return;
      done = true;
      context.signal.removeEventListener("abort", cancel);
      if (usePluginActionUi.getState().request === request)
        usePluginActionUi.setState({ request: null });
      resolve(value);
    };
    const cancel = () => finish(fallback);
    const request = build(finish, ++nextRequestId);
    context.signal.addEventListener("abort", cancel, { once: true });
    usePluginActionUi.setState({ request });
  });
}

export function createDesktopApp(databaseName: string): AppAdapter {
  return {
    pick(context, plugin, options) {
      assertPluginUserActivation();
      context.signal.throwIfAborted();
      if (usePluginPickerUi.getState().request) throw new Error("已有一个选择窗口正在打开");
      // 用户亲手选中即视为同意插件之后读取这些内容的标题，登记后再交给插件
      const grant = async (picked: PluginPickedEntity[]) => {
        if (picked.length)
          await bindDatabaseCommands(
            { grantPluginRefs },
            { databaseName, signal: context.signal }
          ).grantPluginRefs(
            databaseName,
            context.pluginId,
            picked.map(item => item.ref)
          );
        return picked;
      };
      return new Promise((resolve, reject) => {
        const finish = (picked: PluginPickedEntity[]) => {
          context.signal.removeEventListener("abort", abort);
          if (usePluginPickerUi.getState().request === request)
            usePluginPickerUi.setState({ request: null });
          grant(picked).then(resolve, reject);
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
      assertPluginUserActivation();
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
      const page = OPEN_PAGES[ref.kind];
      if (page) return openPage(page, { id: Number(ref.id) });
      if (ref.kind === "material") {
        const [materialKind, id] = ref.id.split(":");
        const { openMaterial } = await import("@/services/open-material");
        context.signal.throwIfAborted();
        return openMaterial({ kind: materialKind as "excerpt", id: Number(id) });
      }
      if (ref.kind === "chat-session") {
        // 只有主对话能单独打开；PDF、视频笔记与 Notebook 里的对话在各自页面中
        const session = await getChatSession(ref.id);
        context.signal.throwIfAborted();
        if (session?.scope !== "main-chat") throw new Error("这段对话不能单独打开");
        return openPage("chat", { id: ref.id });
      }
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
    describe(context, refs, readable) {
      return bindDatabaseCommands(
        { describePluginRefs },
        { databaseName, signal: context.signal }
      ).describePluginRefs(databaseName, context.pluginId, [...refs], [...readable]);
    },
    async run(context, plugin, request: PluginAppRunRequest) {
      assertPluginUserActivation();
      if (usePluginActionUi.getState().request) throw new Error("请先完成或关闭当前打开的窗口");
      if (request.action === "card.create") {
        const nodes = request.content
          ? await bindDatabaseCommands(
              { resolvePluginContentInput },
              { databaseName, signal: context.signal }
            ).resolvePluginContentInput(databaseName, toContentSource(request.content))
          : [];
        return showAction<PluginEntityRef | null>(context, null, (finish, id) => ({
          id,
          plugin,
          action: "card.create",
          content: nodes.length ? nodes : structuredClone(DEFAULT_CARD_CONTENT),
          tags: request.tags ?? [],
          close: () => finish(null),
          settle: cardId => finish({ kind: "card", id: String(cardId) }),
        }));
      }
      const target = await resolvePluginContentTarget(
        databaseName,
        context.pluginId,
        request.ref,
        context.signal
      );
      if (!target) throw new Error("内容不存在");
      const { owner } = target;
      const record = owner
        ? await bindDatabaseCommands(
            { getPluginData },
            { databaseName, signal: context.signal }
          ).getPluginData(databaseName, owner.entity, owner.id)
        : null;
      context.signal.throwIfAborted();
      const title = record?.title || target.own?.title || "未命名";
      if (request.action === "content.export" && request.format === "markdown") {
        const { exportContentAsMarkdown } = await import("@/services/content-transfer");
        context.signal.throwIfAborted();
        await exportContentAsMarkdown({ title, content: target.nodes });
        return;
      }
      return showAction<void>(context, undefined, (finish, id) => ({
        id,
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
        // 插件自有内容没有宿主实体，按通用正文共享
        source: owner
          ? { sourceType: owner.sourceType, sourceId: owner.id, sourceTitle: title }
          : { sourceType: "content", sourceId: target.contentId, sourceTitle: title },
        title,
        content: target.nodes,
        close: () => finish(undefined),
      }));
    },
  };
}
