import { BrowserWindow, net } from "electron";
import log from "electron-log";

const XIAOYUZHOU_EPISODE_REGEX = /xiaoyuzhoufm\.com\/episode\/([a-f0-9]{24})/;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface XiaoyuzhouEpisodeInfo {
  episodeId: string;
  title?: string;
  podcastName?: string;
  coverUrl?: string;
  audioUrl?: string;
  duration?: number;
}

export function parseXiaoyuzhouUrl(url: string): { episodeId: string } | null {
  const match = url.match(XIAOYUZHOU_EPISODE_REGEX);
  return match ? { episodeId: match[1] } : null;
}

async function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: "GET",
      url,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    let body = "";
    request.on("response", (response) => {
      response.on("data", (chunk) => {
        body += chunk.toString();
      });
      response.on("end", () => resolve(body));
    });
    request.on("error", (err) => reject(err));
    request.end();
  });
}

function getMetaContent(html: string, property: string): string | undefined {
  const contentAfterProperty = html.match(
    new RegExp(
      `<meta\\s+[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
  );
  if (contentAfterProperty) {
    return contentAfterProperty[1];
  }

  const contentBeforeProperty = html.match(
    new RegExp(
      `<meta\\s+[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["'][^>]*>`,
      "i",
    ),
  );
  return contentBeforeProperty?.[1];
}

function extractFromMeta(html: string): Partial<XiaoyuzhouEpisodeInfo> {
  const info: Partial<XiaoyuzhouEpisodeInfo> = {};

  const audioUrl = getMetaContent(html, "og:audio");
  if (audioUrl) {
    info.audioUrl = audioUrl;
  }

  const title = getMetaContent(html, "og:title");
  if (title) {
    info.title = title;
  }

  const coverUrl = getMetaContent(html, "og:image");
  if (coverUrl) {
    info.coverUrl = coverUrl;
  }

  const podcastName = getMetaContent(html, "og:site_name");
  if (podcastName) {
    info.podcastName = podcastName;
  }

  return info;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function getEpisodeAudioUrl(episode: any): string | undefined {
  const candidates = [
    episode?.media?.source?.url,
    episode?.enclosure?.url,
    episode?.audio?.url,
    episode?.audioUrl,
    episode?.mediaKey,
  ];

  return candidates.find(isHttpUrl);
}

function extractFromNextData(
  html: string,
): Partial<XiaoyuzhouEpisodeInfo> | null {
  const nextDataMatch = html.match(
    /<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!nextDataMatch) return null;

  try {
    const data = JSON.parse(nextDataMatch[1]);
    const episode =
      data?.props?.pageProps?.episode || data?.props?.pageProps?.data;
    if (!episode) return null;

    return {
      audioUrl: getEpisodeAudioUrl(episode),
      title: episode.title,
      podcastName: episode.podcast?.title,
      coverUrl: episode.image?.picUrl || episode.podcast?.image?.picUrl,
      duration: episode.duration,
    };
  } catch {
    return null;
  }
}

async function fetchViaBrowserWindow(
  url: string,
): Promise<Partial<XiaoyuzhouEpisodeInfo>> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const timeout = setTimeout(() => {
      win.destroy();
      resolve({});
    }, 15000);

    win.webContents.on("did-finish-load", async () => {
      try {
        const result = await win.webContents.executeJavaScript(`
          (function() {
            var audio = document.querySelector('audio');
            var audioSrc = audio ? audio.src : null;
            var ogAudio = document.querySelector('meta[property="og:audio"]');
            var ogTitle = document.querySelector('meta[property="og:title"]');
            var ogImage = document.querySelector('meta[property="og:image"]');
            return {
              audioUrl: audioSrc || (ogAudio ? ogAudio.content : null),
              title: ogTitle ? ogTitle.content : document.title,
              coverUrl: ogImage ? ogImage.content : null,
            };
          })()
        `);
        clearTimeout(timeout);
        win.destroy();
        resolve(result || {});
      } catch (e) {
        clearTimeout(timeout);
        win.destroy();
        resolve({});
      }
    });

    win.loadURL(url).catch(() => {
      clearTimeout(timeout);
      win.destroy();
      resolve({});
    });
  });
}

export async function fetchXiaoyuzhouEpisode(
  url: string,
): Promise<XiaoyuzhouEpisodeInfo | null> {
  const parsed = parseXiaoyuzhouUrl(url);
  if (!parsed) return null;

  const episodeUrl = `https://www.xiaoyuzhoufm.com/episode/${parsed.episodeId}`;

  try {
    // Method A: Direct HTML fetch + meta tag parsing
    const html = await fetchHtml(episodeUrl);

    // Try __NEXT_DATA__ first (richest data)
    const nextDataInfo = extractFromNextData(html);
    if (nextDataInfo?.audioUrl) {
      return {
        episodeId: parsed.episodeId,
        ...nextDataInfo,
      } as XiaoyuzhouEpisodeInfo;
    }

    // Try meta tags
    const metaInfo = extractFromMeta(html);
    if (metaInfo.audioUrl) {
      return {
        episodeId: parsed.episodeId,
        ...metaInfo,
      } as XiaoyuzhouEpisodeInfo;
    }

    // Method B: BrowserWindow fallback (for CSR pages)
    log.info(
      "[Xiaoyuzhou] Meta/NextData extraction failed, falling back to BrowserWindow",
    );
    const browserInfo = await fetchViaBrowserWindow(episodeUrl);
    if (browserInfo.audioUrl) {
      return {
        episodeId: parsed.episodeId,
        ...browserInfo,
      } as XiaoyuzhouEpisodeInfo;
    }

    log.warn("[Xiaoyuzhou] Could not extract audio URL from episode page");
    return null;
  } catch (error) {
    log.error("[Xiaoyuzhou] Failed to fetch episode:", error);
    return null;
  }
}

export function getXiaoyuzhouListenEvents() {
  return {
    "xiaoyuzhou:parse-url": (
      _db: unknown,
      url: string,
    ): { episodeId: string } | null => {
      return parseXiaoyuzhouUrl(url);
    },
    "xiaoyuzhou:fetch-episode": async (
      _db: unknown,
      url: string,
    ): Promise<XiaoyuzhouEpisodeInfo | null> => {
      return fetchXiaoyuzhouEpisode(url);
    },
  };
}
