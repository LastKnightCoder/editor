/**
 * desktopMessagesToPi 的用户消息转换：读不到的图片换成文字占位，不能整条丢
 * （老对话迁移时不下载远程图，只发了一张图的用户消息原来会消失，前后两条回答连成一条）。
 */
import { describe, expect, it } from "vitest";
import type { RequestMessage } from "@/types";
import { desktopMessagesToPi } from "../pi-session-bridge";

const user = (content: RequestMessage["content"]) => ({ role: "user", content }) as RequestMessage;

describe("desktopMessagesToPi 用户消息", () => {
  it("只有一张远程图、不允许联网：保留这条消息，图换成带地址的文字占位", async () => {
    const [message] = await desktopMessagesToPi(
      [user([{ type: "image", image: "http://example.com/a.webp" } as never])],
      "p",
      "m",
      { allowNetwork: false }
    );
    expect(message).toMatchObject({
      role: "user",
      content: [{ type: "text", text: "[图片：http://example.com/a.webp]" }],
    });
  });

  it("本地图文件已不在：占位说明原文件不可用；data URL 照常转成图片", async () => {
    const messages = await desktopMessagesToPi(
      [
        user([
          { type: "text", text: "看图" },
          { type: "image", image: "tau://missing.png", path: "D:/不存在/missing.png" } as never,
          { type: "image", image: "data:image/png;base64,AAAA" } as never,
        ]),
      ],
      "p",
      "m",
      { allowNetwork: false }
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toEqual([
      { type: "text", text: "看图" },
      { type: "text", text: "[图片（原文件已不可用）]" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ]);
  });
});
