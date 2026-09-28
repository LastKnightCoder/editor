import { useMemo } from "react";
import {
  IEditorSlots,
  IResourceService,
  type EditorKit,
  type ServiceRegistration,
} from "@tau/editor/src";
import type { EditorCollaborationBinding } from "@tau/editor/src/collaboration/types";
import { getDesktopKit } from "@/services/editorKit";
import { createAssetMedia } from "./AssetMedia";

/**
 * 共享模式下资源要经 binding 解析、音视频要走资产协议，所以派生一个覆盖这两项服务的 kit。
 * 本机模式（mode === "local"）与无 binding 时直接用应用 kit，不做派生。
 */
export function useCollaborationKit(binding?: EditorCollaborationBinding): EditorKit {
  return useMemo(() => {
    if (!binding || binding.mode === "local") return getDesktopKit();
    const base = getDesktopKit().registry;
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
    return getDesktopKit().extend({ services: [services] });
  }, [binding]);
}
