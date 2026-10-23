import { useCallback, useEffect, useState } from "react";
import { useReadOnly } from "slate-react";
import { useOptionalService } from "@tau/editor";
import { useMediaAppearance } from "@tau/editor/extensions/media";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { IResourceService } from "@tau/shared/host-services";
import type { MediaRuntime, ResourceState } from "@tau/plugins/media";
import { resolveLocalMediaSource } from "../../components/editor/localMedia";
import { mobileEditorSlots } from "../../services/editorRegistry";

function useResource(url: string): ResourceState {
  const resolver = useOptionalService(IResourceService)?.remoteResourceToLocal;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<ResourceState, "retry">>({
    src: undefined,
    status: "loading",
  });
  useEffect(() => {
    let active = true;
    setState({ src: undefined, status: url ? "loading" : "error" });
    if (url) {
      void (async () => {
        const local = resolver ? await resolver(url) : url;
        const src = await resolveLocalMediaSource(local || url);
        if (active) setState({ src: src || undefined, status: src ? "ready" : "error" });
      })().catch(() => {
        if (active) setState({ src: undefined, status: "error" });
      });
    }
    return () => {
      active = false;
    };
  }, [url, resolver, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...state, retry };
}

function useResourceUpload() {
  const service = useOptionalService(IResourceService);
  const readOnly = useReadOnly();
  return readOnly ? undefined : service?.upload;
}

const useSlots = () => useOptionalService(IEditorSlots) ?? mobileEditorSlots;

/** 插件与内置媒体共用当前文档服务，协作文档的覆盖也在此生效。 */
export const mobileMediaRuntime: MediaRuntime = {
  useResource,
  useResourceUpload,
  useMediaAppearance,
  MediaImage: props => {
    const { Image } = useSlots();
    return <Image {...props} />;
  },
  MediaVideo: props => {
    const { Video } = useSlots();
    return <Video {...props} />;
  },
  MediaAudio: props => {
    const { Audio } = useSlots();
    return <Audio {...props} />;
  },
};
