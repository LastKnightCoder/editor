import type { CapabilityId } from "./capabilities";

/**
 * 平台能力接口定义。
 *
 * 业务层通过该接口访问"本机环境"能力（窗口、文件对话框、本地文件、shell 等），
 * 由 Electron 与 Web 各提供一份实现；而"请后端做事"的业务命令（读写文章等）
 * 不属于平台能力，继续走统一 RPC 管道，不经过本层。
 *
 * 能力缺失的表达约定：接口始终完整，Web 实现中无等价物的方法抛
 * UnsupportedError（见 capabilities.ts）；UI 是否渲染入口由 supports() 预判。
 */

export type PlatformKind = "electron" | "web";

/** 宿主操作系统（对齐 Node process.platform 取值；Web 下由浏览器推断） */
export type PlatformOs = "darwin" | "win32" | "linux" | "unknown";

/** 原生文件对话框的扩展名过滤器 */
export interface FileFilter {
  name: string;
  extensions: string[];
}

/** selectFile 的选项（透传给原生 open dialog，Web 实现可忽略） */
export interface FileSelectOptions {
  properties?: string[];
  filters?: FileFilter[];
}

/** 「保存对话框 + 写文件」的载荷；文本传 string，二进制传 Uint8Array */
export interface SaveFilePayload {
  defaultFileName: string;
  filters?: FileFilter[];
  data: string | Uint8Array;
}

export interface SaveFileResult {
  canceled: boolean;
  filePath: string | null;
}

export interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
}

/* ---------- 通知 ---------- */

/** 跨 IPC 的通知按钮：onClick 留在来源端执行，这里只传可序列化的文案 */
export interface SystemNotificationAction {
  label: string;
  /** 主动作（accent 实心），至多一个 */
  primary?: boolean;
  /** 作答成功后的结果行文案；不给则直接退场 */
  resolvedText?: string;
}

/** 通知载荷：主进程裁决路由后在系统通知窗口 / 应用内卡栈 / 原窗口之间传递 */
export interface SystemNotificationPayload {
  /** 必填：路由前由调用方生成；同 id 再推 = 原位更新 */
  id: string;
  title: string;
  body?: string;
  /** 来源标签（如「协作」），展示在标题右侧 */
  source?: string;
  /** lucide 图标名的注册键：两端各自维护名字到组件的映射，函数/组件不可跨 IPC */
  icon?: string;
  /** 人发起的通知：头像文字，优先于 icon */
  avatar?: string;
  /** 头像取色种子（同人恒同色） */
  avatarSeed?: string;
  tone?: "neutral" | "ok" | "danger";
  /** 至多 2 个 */
  actions?: SystemNotificationAction[];
  /** 需作答：常驻到有答案为止 */
  sticky?: boolean;
  /** 事件发生时间（毫秒） */
  timestamp?: number;
}

/** 通知去向：应用内卡栈（调用方渲染端自行入栈）或系统通知窗口（失焦时） */
export type NotificationRoute = "in-app" | "system";

/** 来源为渲染窗口时，force 指定通知去向；省略时按该窗口焦点分流。 */
export interface NotificationRouteOptions {
  force?: NotificationRoute;
}

/** 系统窗口转发给原窗口的按钮执行请求；原窗口执行后经 action-result 回报 */
export interface NotificationRunActionRequest {
  requestId: string;
  id: string;
  index: number;
}

/** action-result 回报体 */
export interface NotificationActionResult {
  requestId: string;
  ok: boolean;
  error?: string;
}

/**
 * 通知能力：路由裁决 + 系统通知窗口（/notification-host）与原窗口之间的桥接通道。
 *
 * 视角约定：route / inAppAction / inAppClosed / onRunAction / onInApp 由业务窗口调用，
 * 其余方法与订阅由系统通知窗口调用；Web 下无系统窗口概念，route 恒返回 "in-app"。
 */
export interface NotificationApi {
  /** 请主进程裁决该通知去向；返回 "in-app" 时调用方自行入栈（不推送） */
  route(
    payload: SystemNotificationPayload,
    options?: NotificationRouteOptions
  ): Promise<NotificationRoute>;
  /** 关闭系统窗口中的一条通知（业务侧撤销/收敛时用） */
  dismiss(id: string): Promise<void>;
  /** 系统窗口：执行通知卡按钮，等待原窗口回报结果后才 settle */
  action(id: string, index: number): Promise<void>;
  /** 系统窗口：某张卡关闭/退场完成时上报，主进程清理登记 */
  closed(id: string): Promise<void>;
  /** 系统窗口：点击卡片主体，激活来源窗口 */
  activate(id: string): Promise<void>;
  /** 系统窗口：切换整窗点击穿透（卡片可交互区域 hover 时关闭穿透） */
  setInteractive(interactive: boolean): Promise<void>;
  /** 系统窗口：栈已清空，隐藏窗口并恢复穿透 */
  empty(): Promise<void>;
  /** 系统窗口：渲染端就绪，冲 flush 主进程排队的通知 */
  ready(): Promise<void>;
  /** 主窗口：执行主进程来源 in-app 卡的按钮 */
  inAppAction(id: string, index: number): Promise<void>;
  /** 主窗口：主进程来源 in-app 卡关闭时清理主进程侧登记 */
  inAppClosed(id: string): Promise<void>;
  /** 系统窗口：订阅新通知推送；返回取消订阅函数 */
  onPush(callback: (payload: SystemNotificationPayload) => void): () => void;
  /** 系统窗口：订阅关闭指令（不传 id = 全部关闭）；返回取消订阅函数 */
  onDismiss(callback: (id?: string) => void): () => void;
  /** 原窗口：订阅系统窗口转发的按钮执行请求，回调（可 async）完成后封装层自动回报结果 */
  onRunAction(
    callback: (request: NotificationRunActionRequest) => Promise<void> | void
  ): () => void;
  /** 主窗口：订阅主进程直投的应用内通知；返回取消订阅函数 */
  onInApp(callback: (payload: SystemNotificationPayload) => void): () => void;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface TextFileChangedPayload {
  filePath: string;
}

export interface DirectoryChangedPayload {
  directoryPath: string;
}

/** 内容编辑窗口承载的内容类型：一个窗口 = 一份数据库文档 */
export type EditorWindowKind = "card" | "article" | "project-item";

/** 内容编辑窗口的身份：同一 target 只开一个窗口（再次打开即聚焦） */
export interface EditorWindowTarget {
  kind: EditorWindowKind;
  databaseName: string;
  id: number;
}

export interface WindowApi {
  close(): Promise<void>;
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  toggleFullScreen(): Promise<void>;
  setAlwaysOnTop(flag: boolean): Promise<void>;
  getState(): Promise<WindowState>;
  /** 恢复、显示并聚焦主窗口（从最小化恢复、移至最前方） */
  showAndFocus(): Promise<void>;
  /** 打开 Markdown 文件窗口：传文件或文件夹路径；不传则打开欢迎页 */
  openMarkdownWindow(path?: string): Promise<void>;
  /** 在独立窗口编辑卡片 / 文章 / 项目文档；已打开则聚焦 */
  openEditorWindow(target: EditorWindowTarget): Promise<void>;
  /** 关闭编辑该文档的窗口（文档被删除时收尾）；未打开则无操作 */
  closeEditorWindow(target: EditorWindowTarget): Promise<void>;
  openPomodoroMiniWindow(): Promise<void>;
  hidePomodoroMiniWindow(): Promise<void>;
  openPomodoroImmersiveWindow(): Promise<void>;
  hidePomodoroImmersiveWindow(): Promise<void>;
  /** 订阅窗口最大化状态变化；返回取消订阅函数 */
  onMaximizedChange(callback: (maximized: boolean) => void): () => void;
  /** 订阅窗口全屏状态变化；返回取消订阅函数 */
  onFullScreenChange(callback: (fullScreen: boolean) => void): () => void;
  /** 订阅窗口焦点变化（Web 下映射为页面 focus/blur）；返回取消订阅函数 */
  onFocusChange(callback: (focused: boolean) => void): () => void;
}

export interface FileDialogApi {
  /** 打开文件选择对话框；用户取消返回 null */
  selectFile(options?: FileSelectOptions): Promise<string[] | null>;
  /** 打开目录选择对话框；用户取消返回 null */
  selectDirectory(): Promise<string | null>;
  /** 弹保存对话框并把文本/二进制内容写入所选路径 */
  saveFile(payload: SaveFilePayload): Promise<SaveFileResult>;
  /**
   * 下载文件并弹保存对话框；返回保存路径。
   * Web 实现用 <a download> 触发浏览器下载，无法得知保存路径，恒返回 null。
   */
  downloadFile(url: string, defaultFileName?: string): Promise<string | null>;
}

export interface LocalFileApi {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  writeBinaryFile(path: string, contents: Uint8Array): Promise<void>;
  /** 仅当文件不存在时创建（存在则抛错），用于抢占式建文件 */
  createTextFileExclusive(path: string, contents: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  createDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readDirectory(path: string): Promise<DirectoryEntry[]>;
  watchTextFile(path: string): Promise<void>;
  unwatchTextFile(path: string): Promise<void>;
  watchDirectory(path: string): Promise<void>;
  unwatchDirectory(path: string): Promise<void>;
  /** 订阅被监听文本文件的外部变更；返回取消订阅函数 */
  onTextFileChanged(callback: (payload: TextFileChangedPayload) => void): () => void;
  /** 订阅被监听目录的外部变更；返回取消订阅函数 */
  onDirectoryChanged(callback: (payload: DirectoryChangedPayload) => void): () => void;
}

export interface ShellApi {
  /** 用系统默认浏览器打开外部链接 */
  openExternal(url: string): Promise<void>;
  /** 在文件管理器中定位并高亮该文件 */
  showInFolder(path: string): Promise<void>;
  /** 用系统默认应用打开文件 */
  openFileWithDefaultApp(path: string): Promise<string>;
}

export interface SystemApi {
  /** 系统已安装字体列表 */
  getFonts(): Promise<string[]>;
  getHomeDir(): Promise<string>;
  /** 应用数据目录（渲染层旧名 getEditorDir 对应的即此目录） */
  getAppDir(): Promise<string>;
  getUserDataDir(): Promise<string>;
}

/**
 * 平台能力聚合入口。业务层统一经 getPlatform()/装配层获取实例，
 * 禁止直接判断运行环境后散落调用各端私有 API。
 */
export interface Platform {
  readonly kind: PlatformKind;
  readonly os: PlatformOs;
  /** 声明式能力查询，UI 据此预先隐藏/禁用无等价物的入口 */
  supports(capability: CapabilityId): boolean;
  readonly window: WindowApi;
  readonly fileDialog: FileDialogApi;
  readonly localFile: LocalFileApi;
  readonly shell: ShellApi;
  readonly system: SystemApi;
  readonly notification: NotificationApi;
}
