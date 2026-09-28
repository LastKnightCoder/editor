import type { CompilerService, FileService, ResourceService } from "../types/services";
import type {
  MediaAction,
  MediaInsertSource,
  MediaSelector,
  VideoContentProvider,
} from "./mediaProviders";
import type { EditorSlots } from "./slots";
import type { ThemeService } from "../theme/ThemeService";

/**
 * 服务标识符：注册与获取服务时使用的唯一 Token。
 * `__serviceType` 为幻影类型字段，运行时不存在，仅用于让不同服务的
 * ServiceIdentifier 在类型层面互不兼容，避免误传。
 */
export interface ServiceIdentifier<T> {
  readonly id: string;
  readonly __serviceType: T;
}

export function createServiceId<T>(id: string): ServiceIdentifier<T> {
  return { id } as ServiceIdentifier<T>;
}

// ==================== 必选服务（未注册时 get/useService 抛错） ====================

export const IResourceService = createServiceId<ResourceService>("resourceService");
export const IFileService = createServiceId<FileService>("fileService");

// ==================== 可选服务（useOptionalService / tryGetService 获取） ====================

export const ICompilerService = createServiceId<CompilerService>("compilerService");

/** 主题服务：未注册时编辑器用 DOM 默认实现（读 <html> 的 data-mode / data-theme） */
export const IThemeService = createServiceId<ThemeService>("themeService");

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
