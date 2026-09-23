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

/** markdown 独立窗口的展示选项（对齐主进程 open-markdown-in-new-window 的可选参数） */
export interface MarkdownWindowOptions {
  showTitlebar?: boolean;
  isDefaultTop?: boolean;
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
  openMarkdownWindow(filePath: string, options?: MarkdownWindowOptions): Promise<void>;
  openPomodoroWindow(): Promise<void>;
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
}
