import type { FileService, OpenerService, ResourceService } from "../types/services";
import type {
  MediaAction,
  MediaInsertSource,
  MediaSelector,
  VideoContentProvider,
} from "./mediaProviders";
import type { EditorSlots } from "./slots";
import type { ThemeService } from "../theme/ThemeService";
import type { ExtensionErrorReporter } from "./errorReporter";
import type { EditorNotifier } from "./notifier";

import { createServiceId } from "@tau/shared/service-contract";
export { createServiceId, type ServiceIdentifier } from "@tau/shared/service-contract";

// ==================== 必选服务（未注册时 get/useService 抛错） ====================

export const IResourceService = createServiceId<ResourceService>("resourceService");
export const IFileService = createServiceId<FileService>("fileService");

// ==================== 可选服务（useOptionalService / tryGetService 获取） ====================

/** 打开链接：未注册时编辑器用 window.open 新开标签页 */
export const IOpenerService = createServiceId<OpenerService>("openerService");

/** 主题服务：未注册时编辑器用 DOM 默认实现（读 <html> 的 data-mode / data-theme） */
export const IThemeService = createServiceId<ThemeService>("themeService");

/** 轻提示与确认：未注册时用 @tau/ui 的 toast（宿主需挂 ToastHost）与原生 confirm */
export const IEditorNotifier = createServiceId<EditorNotifier>("editorNotifier");

/** 扩展运行期错误上报：未注册时写控制台 */
export const IExtensionErrorReporter =
  createServiceId<ExtensionErrorReporter>("extensionErrorReporter");

// ==================== 媒体 Provider（业务注入，未注册即无业务能力） ====================

/** 媒体插入来源（空态面板业务 Tab） */
export const IMediaInsertSources = createServiceId<MediaInsertSource[]>("mediaInsertSources");
/** 视频内容渲染 Provider（平台解析渲染） */
export const IVideoContentProviders =
  createServiceId<VideoContentProvider[]>("videoContentProviders");
/** 已有媒体内容的业务操作（工具条/右键菜单） */
export const IMediaActions = createServiceId<MediaAction[]>("mediaActions");
/** 媒体选择器（画廊加图等原地选择场景的宿主入口） */
export const IMediaSelectors = createServiceId<MediaSelector[]>("mediaSelectors");

// ==================== UI 插槽 ====================

export const IEditorSlots = createServiceId<EditorSlots>("editorSlots");
