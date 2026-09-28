/**
 * Desktop 编辑器服务注册表：组合各服务实现并注册到 token。
 * 应用根部经 EditorProvider 注入。
 */

import {
  createServiceRegistry,
  ICompilerService,
  IEditorSlots,
  IFileService,
  IMediaActions,
  IMediaInsertSources,
  IOpenerService,
  IResourceService,
  IVideoContentProviders,
  type ServiceRegistry,
} from "@tau/editor/src";
import {
  desktopVideoContentProviders,
  desktopVideoInsertSources,
} from "@/editor-providers/videoProviders";
import { ttsInsertSource } from "@/editor-providers/TtsPanel";
import { aiImageEditAction, aiImageInsertSource } from "@/editor-providers/AIImagePanel";
import { openExternal } from "@/commands/extra";

import {
  desktopCompilerService,
  desktopEditorSlots,
  desktopFileService,
  desktopResourceService,
} from "./editorServiceImplementations";

export function createEditorRegistry(): ServiceRegistry {
  return createServiceRegistry(register => {
    // 必选服务
    register(IResourceService, desktopResourceService);
    register(IFileService, desktopFileService);

    // 可选服务（desktop 全量提供）
    register(ICompilerService, desktopCompilerService);
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
  });
}
