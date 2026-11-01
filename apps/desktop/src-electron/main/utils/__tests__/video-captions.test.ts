import { expect, it } from "vitest";
import { parseCaptions, parseJson3Captions, selectCaptionTrack } from "../video-captions";

const track = [{ ext: "json3", url: "https://example.com/captions" }];

it("人工字幕优先于自动字幕，同类字幕优先原语言，忽略聊天和不支持的格式", () => {
  expect(
    selectCaptionTrack({
      language: "ja",
      subtitles: { en: track },
      automatic_captions: { "ja-orig": track },
    })
  ).toEqual({ language: "en", format: "json3", automatic: false });
  expect(
    selectCaptionTrack({
      language: "ja",
      subtitles: {
        en: track,
        ja: [{ ext: "vtt", url: "https://example.com/ja" }],
      },
    })
  ).toEqual({
    language: "ja",
    format: "vtt",
    automatic: false,
  });
  expect(
    selectCaptionTrack({
      automatic_captions: { en: track, "ja-orig": [{ ext: "srt", url: "https://example.com/ja" }] },
    })
  ).toEqual({
    language: "ja-orig",
    format: "srt",
    automatic: true,
  });
  expect(
    selectCaptionTrack({
      subtitles: {
        en: [
          { ext: "srt", url: "https://example.com/srt" },
          { ext: "vtt", url: "https://example.com/vtt" },
          ...track,
        ],
      },
    })
  ).toEqual({ language: "en", format: "json3", automatic: false });
  expect(
    selectCaptionTrack({
      subtitles: { en: [{ ext: "vtt", url: "https://example.com/vtt" }, { ext: "json3" }] },
    })
  ).toEqual({ language: "en", format: "vtt", automatic: false });
  expect(
    selectCaptionTrack({
      subtitles: {
        live_chat: [{ ext: "vtt", url: "chat" }],
        en: [{ ext: "ass", url: "unsupported" }],
      },
    })
  ).toBeNull();
  expect(selectCaptionTrack({})).toBeNull();
});

it("字幕统一为毫秒片段，清理样式与实体，忽略注释、空白和无效时间", () => {
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
  const vtt = [
    "\uFEFFWEBVTT",
    "Kind: captions",
    "",
    "NOTE 注释",
    "00:00.000 --> 00:01.000",
    "不应导入",
    "",
    "STYLE",
    "::cue { color: red; }",
    "",
    "REGION",
    "id:main",
    "",
    "second",
    "01:02:03.004 --> 01:02:04.005 position:20% align:start",
    "<v 讲者><c.green>第二句</c></v>",
    "",
    "first",
    "00:00.123 --> 00:00.579 line:0%",
    "<b>hello</b> <00:00.200>world &amp; &lt;字幕&gt;<br>&#x4e2d;&#25991;",
    "",
    "00:01.000 --> 00:01.000",
    "零时长",
    "",
    "00:02.000 --> 00:01.000",
    "逆序",
    "",
    "00:60.000 --> 00:61.000",
    "无效时间",
    "",
    "00:01.000 --> 00:02.000",
    "<i> </i>",
  ].join("\r\n");
  expect(parseCaptions(vtt, "vtt", "zh-orig")).toEqual({
    language: "zh",
    segments: [
      { text: "hello world & <字幕> 中文", start: 123, end: 579 },
      { text: "第二句", start: 3723004, end: 3724005 },
    ],
  });
  expect(
    parseCaptions(
      "\uFEFF2\r\n00:00:02,001 --> 00:00:03,002\r\n第二句\r\n\r\n1\r\n00:00:00,123 --> 00:00:00,579\r\n{\\an8}<i>hello</i>\r\nworld&nbsp;&quot;字幕&quot; &#x110000; &constructor;",
      "srt",
      "en"
    )
  ).toEqual({
    language: "en",
    segments: [
      { text: 'hello world "字幕" &#x110000; &constructor;', start: 123, end: 579 },
      { text: "第二句", start: 2001, end: 3002 },
    ],
  });
  expect(parseCaptions("WEBVTT\n\n", "vtt", "en")).toBeNull();
  expect(parseCaptions("1\n00:00:01,000 --> 00:00:00,000\n逆序", "srt", "en")).toBeNull();
});
