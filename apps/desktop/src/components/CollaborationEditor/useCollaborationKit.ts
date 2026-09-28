import { useMemo } from "react";
import {
  IEditorSlots,
  IResourceService,
  type EditorKit,
  type ServiceRegistration,
} from "@tau/editor/src";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import { getLibraryContentKit } from "@/services/editorKit";
import { createAssetMedia } from "./AssetMedia";

/**
 * 共享模式下资源要经 binding 解析、音视频要走资产协议，所以派生一个覆盖这两项服务的 kit。
 * 本机模式（mode === "local"）与无 binding 时直接用场景 kit，不做派生。
 */
export function useCollaborationKit(
  binding?: EditorCollaborationBinding,
  /** 场景 kit（ER-016）；缺省为库内正文，因为绝大多数协作内容就是库内正文 */
  scenarioKit?: EditorKit
): EditorKit {
  return useMemo(() => {
    const kit = scenarioKit ?? getLibraryContentKit();
    if (!binding || binding.mode === "local") return kit;
    const base = kit.registry;
    const services: ServiceRegistration = register => {
      register(IResourceService, {
        ...base.get(IResourceService),
        remoteResourceToLocal: url => binding.resolveResource(url),
        upload: file => binding.uploadResource(file),
      });
      register(IEditorSlots, () => {
        const slots = base.get(IEditorSlots);
        return {
          ...slots,
          Video: createAssetMedia(slots.Video, binding),
          Audio: createAssetMedia(slots.Audio, binding),
        };
      });
    };
    return kit.extend({ services: [services] });
  }, [binding, scenarioKit]);
}
