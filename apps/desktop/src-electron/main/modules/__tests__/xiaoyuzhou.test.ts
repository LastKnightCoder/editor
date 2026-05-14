import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const providedEpisodeUrl =
  "https://www.xiaoyuzhoufm.com/episode/69fa7efbf93890ea81499a84";
const providedAudioUrl =
  "https://media.xyzcdn.net/68f97908c348f4bf7ef79ea6/lsJJGh9E-6tVTHxhvyXYBJOekANz.m4a";

const sampleHtml = `
<!doctype html>
<html>
  <head>
    <meta property="og:audio" content="${providedAudioUrl}" />
    <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: {
          pageProps: {
            episode: {
              type: "EPISODE",
              eid: "69fa7efbf93890ea81499a84",
              title:
                "EP 20.生吞A4纸、开车撞派出所、汽油瓶点城管？公检法聊聊暴力抗法",
              duration: 2332,
              mediaKey:
                "68f97908c348f4bf7ef79ea6/lsJJGh9E-6tVTHxhvyXYBJOekANz.m4a",
              media: {
                source: {
                  mode: "PUBLIC",
                  url: providedAudioUrl,
                },
              },
              podcast: {
                title: "不严肃法律",
                image: {
                  picUrl: "https://image.xyzcdn.net/podcast-cover.jpg",
                },
              },
            },
          },
        },
      })}
    </script>
  </head>
</html>
`;

const mockNetRequest = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(),
  net: {
    request: mockNetRequest,
  },
}));

import { fetchXiaoyuzhouEpisode } from "../xiaoyuzhou";

function createMockRequest(options: unknown) {
  const request = new EventEmitter() as EventEmitter & {
    end: () => void;
  };

  request.end = () => {
    const response = new EventEmitter();
    const headers =
      typeof options === "object" && options && "headers" in options
        ? (options as { headers?: Record<string, string> }).headers
        : undefined;
    const hasUserAgent = Boolean(headers?.["User-Agent"]);
    const body = hasUserAgent ? sampleHtml : "<h1>403 Forbidden</h1>";

    request.emit("response", response);
    response.emit("data", Buffer.from(body));
    response.emit("end");
  };

  return request;
}

describe("xiaoyuzhou episode extraction", () => {
  it("应从用户提供的小宇宙链接中提取可播放音频地址", async () => {
    mockNetRequest.mockImplementation(createMockRequest);

    const info = await fetchXiaoyuzhouEpisode(providedEpisodeUrl);

    expect(info).toMatchObject({
      episodeId: "69fa7efbf93890ea81499a84",
      title: "EP 20.生吞A4纸、开车撞派出所、汽油瓶点城管？公检法聊聊暴力抗法",
      podcastName: "不严肃法律",
      audioUrl: providedAudioUrl,
      duration: 2332,
    });
    expect(info?.audioUrl).not.toBe(
      "68f97908c348f4bf7ef79ea6/lsJJGh9E-6tVTHxhvyXYBJOekANz.m4a",
    );
    expect(mockNetRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: providedEpisodeUrl,
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("Mozilla/5.0"),
        }),
      }),
    );
  });
});
