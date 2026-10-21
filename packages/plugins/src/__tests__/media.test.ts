import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { configureMedia } from "../media";
import {
  MediaAudio,
  MediaImage,
  MediaVideo,
  useMediaAppearance,
  useResource,
  useResourceUpload,
} from "../index";

it("媒体 API 由宿主注入，作者入口不加载 DOM", () => {
  expect(typeof document).toBe("undefined");
  expect(() => useResource("a.png", { kind: "image" })).toThrow("媒体组件需要 Tau 宿主");

  const retry = vi.fn();
  const upload = vi.fn(async () => "b.png");
  const resolve = vi.fn(() => ({ src: "preview:a.png", status: "ready" as const, retry }));
  configureMedia({
    useResource: resolve,
    useResourceUpload: () => upload,
    useMediaAppearance: () => ({ borderRadius: "md" }),
    MediaImage: props => createElement("img", { src: props.url }),
    MediaVideo: props => createElement("video", { src: props.src }),
    MediaAudio: props => createElement("audio", { src: props.src }),
  });

  expect(useResource("a.png", { kind: "image" }).src).toBe("preview:a.png");
  expect(resolve).toHaveBeenCalledWith("a.png", { kind: "image" });
  expect(useResourceUpload()).toBe(upload);
  expect(useMediaAppearance()).toEqual({ borderRadius: "md" });
  expect(MediaImage({ url: "a.png" })?.props).toMatchObject({ src: "a.png" });
  expect(MediaVideo({ src: "v.mp4" })?.type).toBe("video");
  expect(MediaAudio({ src: "a.mp3" })?.type).toBe("audio");
});
