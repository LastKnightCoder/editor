import type { PluginContentInput } from "./content-input";
import type { PluginContentRef } from "./data";

/**
 * 关联与打开已有内容：插件页面（如自建画布）引用用户的卡片、日记、待办等，并在点击时打开。
 * 引用可以序列化后存入插件自己的数据；id 对插件不透明，与 context.data 中同类实体的 id 一致。
 */
import type { PluginPermission } from "./permissions";

export type PluginEntityKind =
  | "card"
  | "article"
  | "document"
  | "diary"
  | "whiteboard"
  | "todo"
  | "event"
  | "project"
  | "notebook"
  /** 外部材料：划线、PDF 标注与剪藏 */
  | "material"
  | "chat-session"
  /** 插件自建的内容，包括其他插件的 */
  | "plugin-entity";

export const PLUGIN_ENTITY_KINDS: readonly PluginEntityKind[] = [
  "card",
  "article",
  "document",
  "diary",
  "whiteboard",
  "todo",
  "event",
  "project",
  "notebook",
  "material",
  "chat-session",
  "plugin-entity",
];

/**
 * 不经选择时，读取一类引用的标题所需的权限；null 表示只能经用户选择获得。
 * 插件读取自己创建的插件内容不需要权限。
 */
export const PLUGIN_ENTITY_READ_PERMISSIONS: Readonly<
  Record<PluginEntityKind, PluginPermission | null>
> = Object.freeze({
  card: "cards:read",
  article: "articles:read",
  document: "documents:read",
  diary: null,
  whiteboard: "whiteboards:read",
  todo: "todos:read",
  event: "calendar:read",
  project: "projects:read",
  notebook: "notebooks:read",
  material: "materials:read",
  "chat-session": "chats:read",
  "plugin-entity": null,
});

export interface PluginEntityRef {
  kind: PluginEntityKind;
  id: string;
}

/** 用户选中的一项：标题是选择时的快照；之后可用 describe 取最新标题，不需要读取权限 */
export interface PluginPickedEntity {
  ref: PluginEntityRef;
  title: string;
}

/**
 * 一项引用的当前状态。ok：title 为最新标题；missing：内容已删除；denied：用户没有选择过这项，
 * 也没有授予 permission（为 null 时这类内容只能经用户选择获得）。
 */
export type PluginEntityDescription =
  | { ref: PluginEntityRef; status: "ok"; title: string }
  | { ref: PluginEntityRef; status: "missing" }
  | { ref: PluginEntityRef; status: "denied"; permission: PluginPermission | null };

export interface PluginPickOptions {
  /** 可选类型，顺序即弹窗中的分组顺序 */
  kinds: readonly PluginEntityKind[];
  /** 默认 false：点选一项即确认 */
  multiple?: boolean;
  /** 弹窗标题，默认「选择要关联的内容」 */
  title?: string;
}

export type PluginExportFormat = "markdown" | "image" | "pdf" | "epub";
export const PLUGIN_EXPORT_FORMATS: readonly PluginExportFormat[] = [
  "markdown",
  "image",
  "pdf",
  "epub",
];

/**
 * 宿主动作：界面与确认都由 Tau 提供，插件拿不到正文。content.* 支持卡片、文章、项目文档与
 * 插件内容的正文。
 */
export interface PluginAppActions {
  /** Markdown 直接保存文件；图片、PDF、EPUB 打开导出窗口 */
  "content.export": { ref: PluginContentRef; format: PluginExportFormat };
  /** 全屏演示 */
  "content.present": { ref: PluginContentRef };
  /** 打开「内容协作」窗口，由用户确认发起共享或管理成员 */
  "content.share": { ref: PluginContentRef };
  /** 打开 Tau 的新建卡片窗口并预填，用户可以修改后保存 */
  "card.create": { content?: PluginContentInput; tags?: string[] };
  /** 打开「插入到项目」窗口，由用户选择项目与位置，复制这份正文为新的项目文档 */
  "project.insertDocument": { content: PluginContentInput; title?: string };
}

/** 各动作的结果：新建类返回新内容的引用，用户取消时为 null */
export interface PluginAppActionResults {
  "content.export": void;
  "content.present": void;
  "content.share": void;
  "card.create": PluginEntityRef | null;
  "project.insertDocument": PluginEntityRef | null;
}

export type PluginAppAction = keyof PluginAppActions;
export const PLUGIN_APP_ACTIONS: readonly PluginAppAction[] = [
  "content.export",
  "content.present",
  "content.share",
  "card.create",
  "project.insertDocument",
];

export interface PluginApp {
  /**
   * 打开 Tau 的搜索选择弹窗，返回用户选中的内容；用户取消时返回空数组。
   * 用户亲手挑选即视为同意插件引用这些内容，不需要读取权限。只能在用户操作（点击、按键）后调用。
   */
  pick(options: PluginPickOptions): Promise<PluginPickedEntity[]>;
  /** 打开对应的页面：卡片详情、日记当天、待办详情、日程详情等。只能在用户操作后调用；内容已删除时抛错。 */
  open(ref: PluginEntityRef): Promise<void>;
  /**
   * 批量取引用的当前标题与是否已删除，结果与 refs 一一对应，每次最多 200 项。用户选择过的内容、
   * 本插件自己的内容不需要权限；其余需要该类的读取权限，未获准时为 denied，不弹窗询问。
   */
  describe(refs: readonly PluginEntityRef[]): Promise<PluginEntityDescription[]>;
  /**
   * 执行宿主动作，用户关闭对应界面后返回结果，见 PluginAppActionResults。只能在用户操作后调用，
   * 同一时间只能打开一个；不需要数据权限，用户在界面中确认即同意。内容已删除时抛错。
   */
  run<A extends PluginAppAction>(
    action: A,
    options: PluginAppActions[A]
  ): Promise<PluginAppActionResults[A]>;
}
