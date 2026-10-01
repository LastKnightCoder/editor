import type { ThemeService } from "../theme/ThemeService";
import type { ExtensionErrorReporter } from "./errorReporter";
import type { EditorNotifier } from "./notifier";

import { createServiceId } from "@tau/shared/service-contract";
export { createServiceId, type ServiceIdentifier } from "@tau/shared/service-contract";

// ==================== 可选服务（useOptionalService / tryGetService 获取） ====================

/** 主题服务：未注册时编辑器用 DOM 默认实现（读 <html> 的 data-mode / data-theme） */
export const IThemeService = createServiceId<ThemeService>("themeService");

/** 轻提示与确认：未注册时用 @tau/ui 的 toast（宿主需挂 ToastHost）与原生 confirm */
export const IEditorNotifier = createServiceId<EditorNotifier>("editorNotifier");

/** 扩展运行期错误上报：未注册时写控制台 */
export const IExtensionErrorReporter =
  createServiceId<ExtensionErrorReporter>("extensionErrorReporter");
