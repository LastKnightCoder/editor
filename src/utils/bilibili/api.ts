/**
 * Bilibili API 调用模块
 * 负责与 Bilibili 服务器进行数据交互
 */

import {
  BilibiliCredentials,
  BilibiliVideoInfo,
  BilibiliPlayUrl,
  BilibiliUserInfo,
  BilibiliSubtitle,
  BilibiliQualityInfo,
  BilibiliApiResponse,
  BilibiliVideoApiData,
  BilibiliPlayInfoApiData,
  BilibiliUserNavApiData,
  BilibiliNetworkError,
  BilibiliAuthError,
  BilibiliParseError,
  QUALITY_MAP,
} from "./types";
import {
  parseBilibiliUrl,
  extractInitialState,
  extractPlayInfo,
  formatDuration,
  av2bv,
} from "./parser";
import { nodeFetch } from "@/commands";

// Bilibili API 基础配置
const BILIBILI_BASE_URL = "https://api.bilibili.com";
const BILIBILI_WEB_URL = "https://www.bilibili.com";

// User-Agent 字符串
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

/**
 * 创建带凭证的请求头
 */
export function createHeaders(
  credentials?: BilibiliCredentials,
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Referer: "https://www.bilibili.com/",
    Origin: "https://www.bilibili.com",
  };

  if (credentials?.SESSDATA) {
    let cookie = `SESSDATA=${credentials.SESSDATA}`;
    if (credentials.bfe_id) {
      cookie += `;bfe_id=${credentials.bfe_id}`;
    }
    headers["Cookie"] = cookie;
  }

  return headers;
}

async function fetchWithRetry(
  url: string,
  options: any,
  retries = 3,
): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await nodeFetch(url, {
        ...options,
        headers: {
          ...createHeaders(),
          ...options.headers,
        },
      });

      console.log("fetchWithRetry", response);

      return response;
    } catch (error) {
      if (i === retries - 1) {
        throw new BilibiliNetworkError(`请求失败: ${url}`, error);
      }

      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }

  throw new BilibiliNetworkError(`请求失败: ${url}`);
}

export async function checkBilibiliLogin(
  credentials: BilibiliCredentials,
): Promise<BilibiliUserInfo> {
  try {
    const response = await fetchWithRetry(
      `${BILIBILI_BASE_URL}/x/web-interface/nav`,
      {
        headers: createHeaders(credentials),
      },
    );

    const data: BilibiliApiResponse<BilibiliUserNavApiData> = response;

    if (data.code !== 0) {
      throw new BilibiliAuthError(`登录验证失败: ${data.message}`);
    }

    return {
      name: data.data.uname || "",
      avatar: data.data.face || "",
      isLogin: data.data.isLogin,
      vipStatus: data.data.vipStatus || 0,
    };
  } catch (error) {
    if (error instanceof BilibiliAuthError) {
      throw error;
    }
    throw new BilibiliNetworkError("检查登录状态失败", error);
  }
}

export async function getVideoInfoByUrl(
  url: string,
  credentials?: BilibiliCredentials,
): Promise<BilibiliVideoInfo> {
  const parsedUrl = parseBilibiliUrl(url);

  switch (parsedUrl.type) {
    case "BV":
      if (parsedUrl.bvid) {
        return getVideoInfoByBvid(parsedUrl.bvid, credentials);
      } else if (parsedUrl.aid) {
        const bvid = av2bv(parseInt(parsedUrl.aid));
        return getVideoInfoByBvid(bvid, credentials);
      }
      break;
  }

  throw new BilibiliParseError("无法获取视频信息");
}

export async function getVideoInfoByBvid(
  bvid: string,
  credentials?: BilibiliCredentials,
): Promise<BilibiliVideoInfo> {
  try {
    try {
      return await getVideoInfoByApi(bvid, credentials);
    } catch (apiError) {
      console.warn("API 方法失败，尝试页面解析方法:", apiError);
    }

    return await getVideoInfoByPage(bvid, credentials);
  } catch (error) {
    throw new BilibiliNetworkError(`获取视频信息失败: ${bvid}`, error);
  }
}

async function getVideoInfoByApi(
  bvid: string,
  credentials?: BilibiliCredentials,
): Promise<BilibiliVideoInfo> {
  const response = await fetchWithRetry(
    `${BILIBILI_BASE_URL}/x/web-interface/view?bvid=${bvid}`,
    {
      headers: createHeaders(credentials),
    },
  );

  const data: BilibiliApiResponse<BilibiliVideoApiData> = response;

  if (data.code !== 0) {
    throw new BilibiliParseError(`API 返回错误: ${data.message}`);
  }

  const videoData = data.data;

  let qualityInfo: BilibiliQualityInfo | null = null;
  try {
    qualityInfo = await getQualityInfo(
      videoData.cid.toString(),
      bvid,
      credentials,
    );
  } catch (error) {
    console.warn("获取画质信息失败:", error);
  }

  return {
    bvid: videoData.bvid,
    cid: videoData.cid.toString(),
    title: videoData.title,
    cover: videoData.pic,
    duration: formatDuration(videoData.duration),
    view: videoData.stat.view,
    danmaku: videoData.stat.danmaku,
    reply: videoData.stat.reply,
    up: videoData.staff || [
      { name: videoData.owner.name, mid: videoData.owner.mid },
    ],
    qualityOptions:
      qualityInfo?.accept_quality.map((q) => ({
        label: QUALITY_MAP[q] || `${q}P`,
        value: q,
      })) || [],
    pages: videoData.pages.map((page) => ({
      title: page.part,
      url: `${BILIBILI_WEB_URL}/video/${bvid}?p=${page.page}`,
      page: page.page,
      duration: formatDuration(page.duration),
      cid: page.cid.toString(),
      bvid: videoData.bvid,
    })),
  };
}

async function getVideoInfoByPage(
  bvid: string,
  credentials?: BilibiliCredentials,
): Promise<BilibiliVideoInfo> {
  const response = await fetchWithRetry(`${BILIBILI_WEB_URL}/video/${bvid}`, {
    headers: createHeaders(credentials),
  });

  const html = response;
  const initialState = extractInitialState(html);
  const playInfo = extractPlayInfo(html);

  const videoData = initialState.videoData;
  if (!videoData) {
    throw new BilibiliParseError("页面中未找到视频数据");
  }

  let qualityOptions: Array<{ label: string; value: number }> = [];
  if (playInfo?.data?.accept_quality) {
    qualityOptions = playInfo.data.accept_quality.map((q: number) => ({
      label: QUALITY_MAP[q] || `${q}P`,
      value: q,
    }));
  }

  return {
    bvid: videoData.bvid,
    cid: videoData.cid.toString(),
    title: videoData.title,
    cover: videoData.pic,
    duration: formatDuration(videoData.duration),
    view: videoData.stat.view,
    danmaku: videoData.stat.danmaku,
    reply: videoData.stat.reply,
    up: videoData.staff || [
      { name: videoData.owner.name, mid: videoData.owner.mid },
    ],
    qualityOptions,
    pages:
      videoData.pages?.map((page: any) => ({
        title: page.part,
        url: `${BILIBILI_WEB_URL}/video/${bvid}?p=${page.page}`,
        page: page.page,
        duration: formatDuration(page.duration),
        cid: page.cid.toString(),
        bvid: videoData.bvid,
      })) || [],
  };
}

export async function getPlayUrl(
  cid: string,
  bvid: string,
  quality = 80,
  credentials?: BilibiliCredentials,
): Promise<BilibiliPlayUrl> {
  try {
    const response = await fetchWithRetry(
      `${BILIBILI_BASE_URL}/x/player/wbi/playurl?cid=${cid}&bvid=${bvid}&qn=${quality}&type=&otype=json&fourk=1&fnver=0&fnval=80`,
      {
        headers: createHeaders(credentials),
      },
    );

    const data: BilibiliApiResponse<BilibiliPlayInfoApiData> = response;

    if (data.code !== 0) {
      throw new BilibiliParseError(`获取播放地址失败: ${data.message}`);
    }

    const dash = data.data.dash;
    if (!dash || !dash.video || !dash.audio) {
      throw new BilibiliParseError("未找到可用的播放地址");
    }

    console.log(
      `获取到 ${dash.video.length} 个视频流, ${dash.audio.length} 个音频流`,
    );

    const sortedAudios = dash.audio.sort((a, b) => b.id - a.id);
    // 首先选择可用的音频流
    let audioStream = await selectAvailableStream(sortedAudios);
    if (!audioStream) {
      console.warn("未找到可用的音频流，使用第一个作为备选");
      audioStream = sortedAudios[0];
    }

    // 查找匹配指定质量的视频流
    const matchingVideoStreams = dash.video.filter((v) => v.id === quality);
    let videoStream = await selectAvailableStream(matchingVideoStreams);
    if (!videoStream) {
      console.warn("未找到可用的视频流，尝试从所有视频流中选择可用的");
      videoStream = selectAvailableStream(dash.video);
      if (!videoStream) {
        console.warn("未找到可用的视频流，使用第一个作为备选");
        videoStream = dash.video[0];
      }
    }

    console.log(
      `最终选择: 视频流质量 ${videoStream.id}, 音频流质量 ${audioStream.id}`,
    );

    return {
      video: videoStream.baseUrl,
      audio: audioStream.baseUrl,
      quality: videoStream.id,
    };
  } catch (error) {
    throw new BilibiliNetworkError(`获取播放地址失败: ${bvid}`, error);
  }
}

export async function getQualityInfo(
  cid: string,
  bvid: string,
  credentials?: BilibiliCredentials,
): Promise<BilibiliQualityInfo> {
  const response = await fetchWithRetry(
    `${BILIBILI_BASE_URL}/x/player/wbi/playurl?cid=${cid}&bvid=${bvid}&qn=127&type=&otype=json&fourk=1&fnver=0&fnval=80`,
    {
      headers: createHeaders(credentials),
    },
  );

  const data: BilibiliApiResponse<BilibiliPlayInfoApiData> = response;

  if (data.code !== 0) {
    throw new BilibiliParseError(`获取画质信息失败: ${data.message}`);
  }

  return {
    accept_quality: data.data.accept_quality,
    video: data.data.dash.video.map((v) => ({
      id: v.id,
      cid,
      url: v.baseUrl,
    })),
    audio: data.data.dash.audio.map((a) => ({
      id: a.id,
      cid,
      url: a.baseUrl,
    })),
  };
}

export async function getSubtitles(
  cid: string,
  bvid: string,
  credentials?: BilibiliCredentials,
): Promise<BilibiliSubtitle[]> {
  try {
    const response = await fetchWithRetry(
      `${BILIBILI_BASE_URL}/x/player/v2?cid=${cid}&bvid=${bvid}`,
      {
        headers: createHeaders(credentials),
      },
    );

    const data: BilibiliApiResponse<any> = response;

    if (data.code !== 0) {
      return []; // 字幕不是必需的，失败时返回空数组
    }

    const subtitle = data.data.subtitle;
    if (!subtitle || !subtitle.subtitles) {
      return [];
    }

    return subtitle.subtitles.map((sub: any) => ({
      title: sub.lan_doc,
      url: sub.subtitle_url.startsWith("//")
        ? `https:${sub.subtitle_url}`
        : sub.subtitle_url,
    }));
  } catch (error) {
    console.warn("获取字幕失败:", error);
    return [];
  }
}

/**
 * 检查单个流 URL 是否可用
 */
async function checkSingleStreamAvailability(
  streamUrl: string,
): Promise<boolean> {
  try {
    await nodeFetch(streamUrl, {
      method: "HEAD",
      headers: {
        Referer: "https://www.bilibili.com/",
        ...createHeaders(),
      },
    });
    return true;
  } catch (error) {
    console.warn("检查流可用性失败:", error);
    return false;
  }
}

/**
 * 从多个相同质量的流中选择第一个可用的
 */
async function selectAvailableStream(
  streams: Array<{ id: number; baseUrl: string }>,
): Promise<any> {
  for (const stream of streams) {
    const isAvailable = await checkSingleStreamAvailability(stream.baseUrl);
    if (isAvailable) {
      console.log(`找到可用的流: ${stream.baseUrl}`);
      return stream;
    }
    console.warn(`流不可用，跳过: ${stream.baseUrl}`);
  }

  console.warn("所有流都不可用，使用第一个作为备选");
  return undefined;
}

// 登录二维码信息
export interface BilibiliQRInfo {
  qrcodeKey: string;
  url: string;
}

// 扫码登录状态
export enum BilibiliQRCodeStatus {
  SUCCESS = 0, // 扫码登录成功
  EXPIRED = 86038, // 二维码已失效
  NOT_CONFIRMED = 86090, // 二维码已扫码未确认
  NOT_SCANNED = 86101, // 二维码未扫码
}

export interface BilibiliQRStatusResult {
  code: BilibiliQRCodeStatus;
  message: string;
  refreshToken?: string;
  timestamp?: number;
  url?: string;
}

export async function getBilibiliQRCode(): Promise<BilibiliQRInfo> {
  try {
    const response = await fetchWithRetry(
      `http://passport.bilibili.com/qrcode/getLoginUrl`,
      {
        method: "GET",
        headers: createHeaders(),
      },
    );

    const data: BilibiliApiResponse<{
      oauthKey: string;
      url: string;
    }> = response;

    if (data.code !== 0) {
      throw new BilibiliNetworkError(`获取二维码失败: ${data.message}`);
    }

    return {
      qrcodeKey: data.data.oauthKey,
      url: data.data.url,
    };
  } catch (error) {
    throw new BilibiliNetworkError("获取登录二维码失败", error);
  }
}

export async function checkBilibiliQRStatus(
  qrcodeKey: string,
): Promise<BilibiliQRStatusResult> {
  try {
    const response = await fetchWithRetry(
      `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcodeKey}&source=main-fe-header&web_location=333.1007`,
      {
        method: "GET",
        headers: createHeaders(),
      },
    );

    const data: BilibiliApiResponse<{
      code: number;
      message: string;
      refresh_token?: string;
      timestamp?: number;
      url?: string;
    }> = response;

    const loginCode = data.data?.code ?? data.code;

    return {
      code: loginCode as BilibiliQRCodeStatus,
      message: data.data?.message || data.message,
      refreshToken: data.data?.refresh_token,
      timestamp: data.data?.timestamp,
      url: data.data?.url,
    };
  } catch (error) {
    throw new BilibiliNetworkError("检查二维码状态失败", error);
  }
}

export async function extractCredentialsFromQR(
  url: string,
): Promise<BilibiliCredentials> {
  try {
    // 直接从 URL 查询参数中解析 SESSDATA 和 bfe_id
    // 例如：...&SESSDATA=xxx&bfe_id=yyy
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    const SESSDATA = params.get("SESSDATA") || "";
    const bfe_id = params.get("bfe_id") || "";

    if (!SESSDATA) {
      throw new BilibiliAuthError("未能获取到有效的登录凭证");
    }

    return { SESSDATA, bfe_id };
  } catch (error) {
    throw new BilibiliAuthError("提取登录凭证失败", error);
  }
}
