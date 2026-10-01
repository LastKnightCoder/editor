import type { ComponentType, ReactNode, Ref } from "react";

/**
 * UI 插槽：宿主应用注入的平台专属 React 组件。
 * 与服务不同，插槽是"编辑器渲染什么组件"的组合点。
 * 内容源业务能力（视频平台解析等）不经插槽，走 MediaProvider 协议。
 */

/** 图片插槽（桌面端为 LocalImage，负责本地路径解析、远程缓存等） */
export interface ImageSlotProps {
  url: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLImageElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLImageElement>;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement>) => void;
  /** 宿主的回退地址也加载失败后回调（编辑器据此显示失败态），不透传到 img */
  onLoadError?: () => void;
  crossOrigin?: React.ImgHTMLAttributes<HTMLImageElement>["crossOrigin"];
  /** 宿主默认懒加载；离屏解析（如裁剪前取原图）需要 eager */
  loading?: "eager" | "lazy";
  draggable?: boolean;
  ref?: Ref<HTMLImageElement>;
}

/** 视频插槽（桌面端为 LocalVideo），透传原生 video 属性 */
export type VideoSlotProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
  playbackRate?: number;
  /** 用户在播放器里改了倍速（宿主播放器支持时回调，编辑器据此写回节点） */
  onPlaybackRateChange?: (rate: number) => void;
  /** 播放器底栏信息位（来源 · 标题），原生实现忽略 */
  info?: ReactNode;
  ref?: Ref<HTMLVideoElement>;
};

/** 音频插槽（桌面端为 LocalAudio） */
export interface AudioSlotProps {
  src: string;
  controls?: boolean;
  label?: string;
  labelSlot?: ReactNode;
  /** 生成该音频的原文（文本转语音），播放器据此显示「文本生成」标记与原文展开 */
  sourceText?: string;
  className?: string;
  ref?: Ref<HTMLAudioElement>;
}

export interface EditorSlots {
  Image: ComponentType<ImageSlotProps>;
  Video: ComponentType<VideoSlotProps>;
  Audio: ComponentType<AudioSlotProps>;
}
