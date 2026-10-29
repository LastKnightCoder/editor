import { expect, it } from "vitest";
import { appendSessionEntries, createSessionFile, projectSessionMessages } from "../index";

it("展示记录含另一设备路径时，使用权威消息内的图片数据投影，保留展示文字与来源信息", () => {
  const document = appendSessionEntries(createSessionFile({ id: "images" }), [
    {
      type: "message",
      message: {
        role: "user",
        timestamp: 1,
        content: [
          { type: "text", text: "查看图片" },
          { type: "image", mimeType: "image/png", data: "aGVsbG8=" },
        ],
      },
    },
    {
      type: "custom",
      customType: "desktop-display",
      data: {
        modelText: "查看图片",
        content: [
          { type: "text", text: "原始问题", skills: ["image"] },
          {
            type: "image",
            image: "file:///other-device/image.png",
            path: "/other-device/image.png",
          },
        ],
      },
    },
  ]);
  const messages = projectSessionMessages(document);
  expect(messages[0].content).toEqual([
    { type: "text", text: "原始问题", skills: ["image"] },
    { type: "image", image: "data:image/png;base64,aGVsbG8=", path: "/other-device/image.png" },
  ]);
  expect(JSON.stringify(document)).toContain("file:///other-device/image.png");
});
