import { expect, it } from "vitest";
import { parseJson3Captions, selectCaptionTrack } from "../video-captions";

const track = [{ ext: "json3", url: "https://example.com/captions" }];

it("人工字幕优先于自动字幕，同类字幕优先原语言，忽略聊天和不支持的格式", () => {
  expect(
    selectCaptionTrack({
      language: "ja",
      subtitles: { en: track },
      automatic_captions: { "ja-orig": track },
    })
  ).toEqual({ language: "en", automatic: false });
  expect(selectCaptionTrack({ language: "ja", subtitles: { en: track, ja: track } })).toEqual({
    language: "ja",
    automatic: false,
  });
  expect(selectCaptionTrack({ automatic_captions: { en: track, "ja-orig": track } })).toEqual({
    language: "ja-orig",
    automatic: true,
  });
  expect(
    selectCaptionTrack({ subtitles: { live_chat: [{ ext: "json", url: "chat" }] } })
  ).toBeNull();
  expect(selectCaptionTrack({})).toBeNull();
});

it("合并 JSON3 词片段并保留毫秒时间戳，空白和无效时间不生成字幕", () => {
  expect(
    parseJson3Captions(
      {
        events: [
          { tStartMs: 123, dDurationMs: 456, segs: [{ utf8: "hello " }, { utf8: "world\n" }] },
          { tStartMs: 0, dDurationMs: 100, segs: [{ utf8: "\n" }] },
          { tStartMs: -1, dDurationMs: 100, segs: [{ utf8: "错" }] },
          { tStartMs: 800, segs: [{ utf8: "缺时长" }] },
          { tStartMs: 0, dDurationMs: 100 },
        ],
      },
      "en-orig"
    )
  ).toEqual({ language: "en", segments: [{ text: "hello world", start: 123, end: 579 }] });
  expect(parseJson3Captions({ events: [] }, "en")).toBeNull();
  expect(() => parseJson3Captions({}, "en")).toThrow("字幕数据无效");
});
