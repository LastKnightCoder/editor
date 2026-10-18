/** 文档页的编辑器服务：只读展示，媒体用原生元素，站内链接交给文档路由 */
import type { ServiceRegistration } from "@tau/editor";
import { IOpenerService } from "@tau/shared/host-services";
import {
  IEditorSlots,
  type AudioSlotProps,
  type EditorSlots,
  type ImageSlotProps,
  type VideoSlotProps,
} from "@tau/editor-media/services";

const docsEditorSlots: EditorSlots = {
  Image: ({ url, alt, onLoadError, loading = "lazy", ...rest }: ImageSlotProps) => (
    <img {...rest} src={url} alt={alt ?? ""} loading={loading} onError={onLoadError} />
  ),
  // 播放器专属的倍速、信息位等属性原生元素用不上，只透传播放所需的部分
  Video: ({ ref, src, className, style, poster }: VideoSlotProps) => (
    <video ref={ref} src={src} className={className} style={style} poster={poster} controls />
  ),
  Audio: ({ ref, src, className, controls = true }: AudioSlotProps) => (
    <audio ref={ref} src={src} className={className} controls={controls} />
  ),
};

export function createDocsEditorServices(navigate: (href: string) => void): ServiceRegistration {
  return register => {
    register(IEditorSlots, docsEditorSlots);
    register(IOpenerService, {
      open: url => {
        const target = new URL(url, location.href);
        if (target.origin === location.origin && target.pathname.startsWith("/docs/")) {
          navigate(target.pathname + target.hash);
          return;
        }
        window.open(target.href, "_blank", "noopener");
      },
    });
  };
}
