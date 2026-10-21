import type {
  CSSProperties,
  ImgHTMLAttributes,
  MouseEventHandler,
  ReactElement,
  ReactNode,
  Ref,
  SyntheticEvent,
  VideoHTMLAttributes,
} from "react";

export type ResourceKind = "image" | "video" | "audio" | "file";

export interface ResourceState {
  /** 可直接给 img / video / audio 的地址；解析中或失败时为 undefined */
  src: string | undefined;
  status: "loading" | "ready" | "error";
  /** 元素加载失败时调用：作废宿主缓存后重新解析 */
  retry(): void;
}

/** 上传到用户当前的资源存储（本地库、远端或共享文档），返回可写入节点的地址 */
export type ResourceUpload = (file: File) => Promise<string>;

export type MediaAppearancePreset = "none" | "sm" | "md" | "lg";

/** 用户设置（发布站为发布设置）里的媒体默认外观；节点自身的设置优先 */
export interface MediaAppearance {
  borderRadius?: MediaAppearancePreset;
  shadow?: MediaAppearancePreset | boolean;
}

export interface MediaImageProps {
  url: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: MouseEventHandler<HTMLImageElement>;
  onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  /** 宿主的回退地址也加载失败后回调 */
  onLoadError?: () => void;
  crossOrigin?: ImgHTMLAttributes<HTMLImageElement>["crossOrigin"];
  /** 默认懒加载 */
  loading?: "eager" | "lazy";
  draggable?: boolean;
  ref?: Ref<HTMLImageElement>;
}

export type MediaVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
  playbackRate?: number;
  onPlaybackRateChange?: (rate: number) => void;
  /** 播放器底栏信息位，宿主播放器不支持时忽略 */
  info?: ReactNode;
  ref?: Ref<HTMLVideoElement>;
};

export interface MediaAudioProps {
  src: string;
  controls?: boolean;
  label?: string;
  labelSlot?: ReactNode;
  className?: string;
  ref?: Ref<HTMLAudioElement>;
}

/** 宿主注入的实现；在编辑器内按当前文档的作用域生效（共享文档走协作资源），编辑器外用应用默认实现。 */
export interface MediaRuntime {
  useResource(url: string, options: { kind: ResourceKind }): ResourceState;
  /** 只读编辑器与没有资源存储的宿主（发布站）返回 undefined */
  useResourceUpload(): ResourceUpload | undefined;
  useMediaAppearance(): MediaAppearance | undefined;
  MediaImage(props: MediaImageProps): ReactElement | null;
  MediaVideo(props: MediaVideoProps): ReactElement | null;
  MediaAudio(props: MediaAudioProps): ReactElement | null;
}

let runtime: MediaRuntime | undefined;
export function configureMedia(value: MediaRuntime) {
  runtime = value;
}
function current() {
  if (!runtime) throw new Error("媒体组件需要 Tau 宿主");
  return runtime;
}

export const useResource: MediaRuntime["useResource"] = (url, options) =>
  current().useResource(url, options);
export const useResourceUpload: MediaRuntime["useResourceUpload"] = () =>
  current().useResourceUpload();
export const useMediaAppearance: MediaRuntime["useMediaAppearance"] = () =>
  current().useMediaAppearance();
// 宿主实现内部使用 hook；占位按函数组件直接调用，保持一个固定的组件身份
export const MediaImage = (props: MediaImageProps) => current().MediaImage(props);
export const MediaVideo = (props: MediaVideoProps) => current().MediaVideo(props);
export const MediaAudio = (props: MediaAudioProps) => current().MediaAudio(props);
