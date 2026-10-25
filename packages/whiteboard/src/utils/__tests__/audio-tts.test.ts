import { expect, it, vi } from "vitest";
import { AudioUtil } from "../AudioUtil";
import type { Board } from "../../types";
it.each([
  ["audio/wav", ".wav"],
  ["audio/mpeg", ".mp3"],
  ["audio/ogg", ".ogg"],
])("TTS插入保留%s的实际格式", async (mime, extension) => {
  const upload = vi.fn(async (_file: File) => "https://files.test/audio");
  const board = {
    captureSubmission: () => () => true,
    viewPort: { minX: 0, minY: 0, width: 100, height: 100 },
    children: [],
    apply: vi.fn(),
  } as unknown as Board;
  await AudioUtil.insertAudioFromTTS(new Blob(["bytes"], { type: mime }), "朗读", board, {
    upload,
    imageInfo: vi.fn(async () => null),
    videoInfo: vi.fn(async () => null),
  });
  const file = upload.mock.calls[0][0];
  expect(file.name.endsWith(extension)).toBe(true);
  expect(file.type).toBe(mime);
  expect(board.apply).toHaveBeenCalledTimes(1);
});
