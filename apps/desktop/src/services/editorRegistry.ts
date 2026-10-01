/**
 * Desktop 编辑器服务注册表：组合各服务实现并注册到 token。
 * 与 getContentKit() 共用同一份注册项。
 */
import { IFileService, IOpenerService, IResourceService } from "@tau/shared/host-services";

import { createServiceRegistry, type ServiceRegistration, type ServiceRegistry } from "@tau/editor";
import {
  IEditorSlots,
  IMediaActions,
  IMediaInsertSources,
  IVideoContentProviders,
} from "@tau/editor-media/services";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { ITypstCompiler } from "@tau/editor-diagram/services";
import { desktopRuntimeStyleCompiler } from "./tailwindRuntime";
import { IOverlayBackDismiss } from "@tau/editor/api";
import { DesktopEditorOverlayDismiss } from "./editorOverlayDismiss";
import {
  desktopVideoContentProviders,
  desktopVideoInsertSources,
} from "@/editor-providers/videoProviders";
import { ttsInsertSource } from "@/editor-providers/TtsPanel";
import { aiImageEditAction, aiImageInsertSource } from "@/editor-providers/AIImagePanel";
import { openExternal } from "@/commands/extra";

import {
  desktopTypstCompiler,
  desktopEditorSlots,
  desktopFileService,
  desktopResourceService,
} from "./editorServiceImplementations";

/** Desktop 的服务注册项：kit 与（过渡期的）registry 共用同一份 */
export const desktopEditorServices: ServiceRegistration = register => {
  register(IOverlayBackDismiss, { Layer: DesktopEditorOverlayDismiss });
  // 必选服务
  register(IResourceService, desktopResourceService);
  register(IFileService, desktopFileService);

  // 可选服务（desktop 全量提供）
  register(ITypstCompiler, desktopTypstCompiler);
  register(IRuntimeStyleCompiler, desktopRuntimeStyleCompiler);
  register(IOpenerService, {
    open: url => {
      void openExternal(url);
    },
  });

  // UI 插槽
  register(IEditorSlots, desktopEditorSlots);

  // 媒体内容源（bilibili / youtube / remote 解析渲染与插入入口）
  register(IVideoContentProviders, desktopVideoContentProviders);
  register(IMediaInsertSources, [
    ...desktopVideoInsertSources,
    ttsInsertSource,
    aiImageInsertSource,
  ]);
  register(IMediaActions, [aiImageEditAction]);
};

export function createEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(desktopEditorServices);
}
