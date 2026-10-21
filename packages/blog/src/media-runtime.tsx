import type { MediaRuntime } from "@tau/plugins/media";
import { useOptionalService } from "@tau/editor/api";
import { useMediaAppearance } from "@tau/editor/extensions/media";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";

const defaultSlots = createDefaultEditorSlots();
const useSlots = () => useOptionalService(IEditorSlots) ?? defaultSlots;

/** 发布站与内置图片块一致，原样加载节点里的地址；没有资源存储，不提供上传。 */
export const blogMediaRuntime: MediaRuntime = {
  useResource: url => ({
    src: url || undefined,
    status: url ? "ready" : "error",
    retry: () => undefined,
  }),
  useResourceUpload: () => undefined,
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
