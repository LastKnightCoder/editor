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
} from "@tau/editor/extensions/media/services";
import { IRuntimeStyleCompiler } from "@tau/shared/runtime-style";
import { ITypstCompiler } from "@tau/editor/extensions/diagram/services";
import { desktopRuntimeStyleCompiler } from "./tailwindRuntime";
import { IOverlayBackDismiss } from "@tau/editor/api";
import { DesktopEditorOverlayDismiss } from "./editorOverlayDismiss";
import {
  desktopVideoContentProviders,
  getDesktopVideoInsertSources,
} from "@/editor-providers/videoProviders";
import { ttsInsertSource } from "@/editor-providers/TtsPanel";
import { aiImageEditAction, aiImageInsertSource } from "@/editor-providers/AIImagePanel";
import { openExternal } from "@/commands/extra";
import { IDocTaskGroups } from "@/editor-extensions/doc-tasks/service";
import { desktopDocTaskGroups } from "./docTaskGroups";

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

  // 勾选项里的 #项目 / 日期胶囊读写待办项目
  register(IDocTaskGroups, desktopDocTaskGroups);

  // 媒体内容源（视频插件 / 远程直链的渲染与插入入口）；视频插件入口随启停增减
  register(IVideoContentProviders, desktopVideoContentProviders);
  register(IMediaInsertSources, () => [
    ...getDesktopVideoInsertSources(),
    ttsInsertSource,
    aiImageInsertSource,
  ]);
  register(IMediaActions, [aiImageEditAction]);
};

export function createEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(desktopEditorServices);
}
