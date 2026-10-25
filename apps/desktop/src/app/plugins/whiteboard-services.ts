import { IResourceService } from "@tau/shared/host-services";
import { IMediaInfoService, IDownloadService } from "@tau/shared/media-services";
import { IWhiteboardAuthorPermission } from "@tau/whiteboard/extensions";
import { IPluginStorage, type WhiteboardAPI } from "@tau/plugins/whiteboard";
import type { PluginDefinition, PluginStorage } from "@tau/plugins";
import { createServiceRegistry, type ServiceRegistry } from "@tau/shared/service-registry";

/** 所属关系来自已校验的插件定义，不从扩展 ID 猜测插件身份。 */
export function createWhiteboardPluginServices(
  parent: ServiceRegistry,
  definitions: readonly PluginDefinition[],
  storageFor: (pluginId: string) => PluginStorage
) {
  const owners = new Map<string, string>();
  for (const definition of definitions) {
    for (const extension of definition.whiteboardExtensions ?? [])
      owners.set(extension.id, definition.id);
  }
  return (extensionId: string, api: Pick<WhiteboardAPI, "captureSubmission">) => {
    const owner = owners.get(extensionId);
    if (!owner) return parent;
    let bound: PluginStorage | undefined;
    const current = () => {
      if (!api.captureSubmission()()) throw new Error("白板当前不可交互");
      const storage = storageFor(owner);
      if (bound && bound !== storage) throw new Error("插件激活实例已改变，请重新打开白板");
      return (bound ??= storage);
    };
    const storage: PluginStorage = {
      get: async key => {
        const valid = api.captureSubmission();
        const value = await current().get(key);
        if (!valid()) throw new Error("白板交互已结束");
        current();
        return value;
      },
      set: async (key, value) => current().set(key, value),
      delete: async key => current().delete(key),
    };
    const guard =
      <T extends unknown[], R>(action: (...args: T) => Promise<R>) =>
      async (...args: T): Promise<R> => {
        current();
        const valid = api.captureSubmission();
        const result = await action(...args);
        if (!valid()) throw new Error("白板交互已结束");
        current();
        return result;
      };
    return createServiceRegistry(register => {
      register(IPluginStorage, storage);
      register(IWhiteboardAuthorPermission, {
        assertActive: () => {
          current();
        },
      });
      const resources = parent.tryGet(IResourceService),
        media = parent.tryGet(IMediaInfoService),
        downloads = parent.tryGet(IDownloadService);
      if (resources)
        register(IResourceService, {
          upload: guard(resources.upload.bind(resources)),
          ...(resources.remoteResourceToLocal
            ? { remoteResourceToLocal: guard(resources.remoteResourceToLocal.bind(resources)) }
            : {}),
        });
      if (media)
        register(IMediaInfoService, {
          imageInfo: guard(media.imageInfo.bind(media)),
          videoInfo: guard(media.videoInfo.bind(media)),
        });
      if (downloads)
        register(IDownloadService, { download: guard(downloads.download.bind(downloads)) });
    });
  };
}
