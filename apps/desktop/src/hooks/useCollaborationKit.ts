import { useMemo } from "react";
import {
  IEditorSlots,
  IResourceService,
  type EditorKit,
  type ServiceRegistration,
} from "@tau/editor/src";
import type { EditorCollaborationBinding } from "@tau/editor-collab";
import { getContentKit } from "@/services/editorKit";
import { createAssetMedia } from "@/components/CollaborationUI/AssetMedia";

const derived = new WeakMap<EditorCollaborationBinding, Map<EditorKit, EditorKit>>();

/**
 * 共享模式下资源要经 binding 解析、音视频要走资产协议，所以派生一个覆盖这两项服务的 kit。
 * 本机模式（mode === "local"）与无 binding 时直接用场景 kit，不做派生。
 *
 * 结果按 binding × 场景 kit 缓存：离屏测高等 React 之外的调用方也要拿到同一个 kit，
 * 否则每次派生出的新 kit 会让编辑器重建。
 */
export function collaborationKit(
  binding?: EditorCollaborationBinding,
  /** 场景 kit（ER-016）；缺省为 content 正文，因为绝大多数协作内容就是 content 正文 */
  scenarioKit?: EditorKit
): EditorKit {
  const kit = scenarioKit ?? getContentKit();
  if (!binding || binding.mode === "local") return kit;
  let cache = derived.get(binding);
  if (!cache) {
    cache = new Map();
    derived.set(binding, cache);
  }
  const cached = cache.get(kit);
  if (cached) return cached;
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
  const next = kit.extend({ services: [services] });
  cache.set(kit, next);
  return next;
}

export function useCollaborationKit(
  binding?: EditorCollaborationBinding,
  scenarioKit?: EditorKit
): EditorKit {
  return useMemo(() => collaborationKit(binding, scenarioKit), [binding, scenarioKit]);
}
