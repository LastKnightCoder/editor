import type { AudioSlotProps, EditorSlots, ImageSlotProps, VideoSlotProps } from "./slots";

/**
 * 默认 UI 插槽：基于原生标签的最小实现。
 * 供只读渲染或无平台能力的应用作为注册基底，可按需覆盖单项。
 */

function DefaultImage({ url, alt, ref, onLoadError, ...rest }: ImageSlotProps) {
  return <img ref={ref} src={url} alt={alt} onError={onLoadError} {...rest} />;
}
DefaultImage.displayName = "DefaultImageSlot";

function DefaultVideo({
  src,
  ref,
  playbackRate: _playbackRate,
  onPlaybackRateChange: _onPlaybackRateChange,
  info: _info,
  ...rest
}: VideoSlotProps) {
  return <video ref={ref} src={src} {...rest} />;
}
DefaultVideo.displayName = "DefaultVideoSlot";

function DefaultAudio({
  src,
  ref,
  label: _label,
  labelSlot: _labelSlot,
  sourceText: _sourceText,
  ...rest
}: AudioSlotProps) {
  return <audio ref={ref} src={src} {...rest} />;
}
DefaultAudio.displayName = "DefaultAudioSlot";

export function createDefaultEditorSlots(): EditorSlots {
  return {
    Image: DefaultImage,
    Video: DefaultVideo,
    Audio: DefaultAudio,
  };
}
