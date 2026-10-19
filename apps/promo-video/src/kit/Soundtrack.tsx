import { Audio, getStaticFiles, interpolate, staticFile, useVideoConfig } from "remotion";
import type { Track } from "../brand/music";

/** 配乐轨：首尾淡入淡出；文件未放入 public/ 时静默跳过，不阻塞预览与渲染 */
/** startAt 覆盖曲目登记的截取起点（秒） */
export function Soundtrack({ track, startAt, fadeIn = 1.2, fadeOut = 3, volume = 0.9 }: { track: Track; startAt?: number; fadeIn?: number; fadeOut?: number; volume?: number }) {
  const { fps, durationInFrames } = useVideoConfig();
  if (!getStaticFiles().some(file => file.name === track.file)) return null;
  return (
    <Audio
      src={staticFile(track.file)}
      startFrom={Math.round((startAt ?? track.offset) * fps)}
      volume={frame =>
        volume *
        interpolate(frame, [0, fadeIn * fps, durationInFrames - fadeOut * fps, durationInFrames], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      }
    />
  );
}
