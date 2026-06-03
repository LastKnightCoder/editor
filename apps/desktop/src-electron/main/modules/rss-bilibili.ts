import crypto from "node:crypto";
import fetch from "node-fetch";
import userSettingModule from "./user-setting";
import type { ParsedFeed, ParsedFeedEntry } from "./rss-parser-lite";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const USER_VIDEO_PREFIX = "tau://rss/bilibili/user-video/";
export const BILIBILI_FOLLOWINGS_DYNAMIC_URL =
  "tau://rss/bilibili/followings-dynamic";
export const BILIBILI_DEFAULT_CATEGORY = "B 站";
const DYNAMIC_TITLE_MAX_LENGTH = 36;
const DYNAMIC_DESCRIPTION_MAX_LENGTH = 120;
const DYNAMIC_CONTENT_TEXT_MAX_LENGTH = 240;
const BILIBILI_BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;

interface BilibiliCredentials {
  SESSDATA?: string;
  bfe_id?: string;
}

interface BilibiliNavResponse {
  code: number;
  message?: string;
  data?: {
    mid?: number;
    uname?: string;
    isLogin?: boolean;
    wbi_img?: {
      img_url?: string;
      sub_url?: string;
    };
  };
}

interface BilibiliFeedPreview {
  title: string;
  siteUrl: string | null;
  description: string | null;
  entriesPreview: Array<{
    title: string;
    url: string | null;
    publishedAt: number | null;
  }>;
}

type LocalBilibiliFeed =
  | {
      type: "user-video";
      uid: string;
    }
  | {
      type: "followings-dynamic";
    };

const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

async function requestJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: unknown, maxLength: number): string {
  const text = stripHtml(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}...`;
}

function getDynamicTypeName(item: any): string {
  const type = item?.desc?.type;
  if (type === 8) return "视频动态";
  if (type === 2) return "图文动态";
  if (type === 4) return "文字动态";
  if (type === 64) return "专栏动态";
  if (type === 256) return "音频动态";
  if (type === 4200) return "直播动态";
  return "动态";
}

function normalizeHttps(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  const value = url.trim();
  const bilibiliVideoDeepLink = value.match(
    /^bilibili:\/\/video\/(?:av)?(\d+)/i,
  );
  if (bilibiliVideoDeepLink?.[1]) {
    return `https://www.bilibili.com/video/av${bilibiliVideoDeepLink[1]}`;
  }
  const bilibiliDynamicDeepLink = value.match(/^bilibili:\/\/dynamic\/(\d+)/i);
  if (bilibiliDynamicDeepLink?.[1]) {
    return `https://t.bilibili.com/${bilibiliDynamicDeepLink[1]}`;
  }
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://")) return value.replace(/^http:/, "https:");
  if (value.startsWith("https://")) return value;
  return null;
}

function buildImageHtml(
  url: unknown,
  width?: unknown,
  height?: unknown,
): string {
  const src = normalizeHttps(url);
  if (!src) return "";
  const attrs = [
    `src="${htmlEscape(src)}"`,
    width ? `width="${htmlEscape(width)}"` : "",
    height ? `height="${htmlEscape(height)}"` : "",
    'referrerpolicy="no-referrer"',
  ]
    .filter(Boolean)
    .join(" ");
  return `<img ${attrs}>`;
}

function normalizeBvid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bvid = value.trim();
  return BILIBILI_BVID_PATTERN.test(bvid) ? bvid : null;
}

function normalizeNumericId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function buildBilibiliVideoMetaComment(meta: {
  bvid?: unknown;
  aid?: unknown;
  cid?: unknown;
  sourceUrl?: unknown;
}): string {
  const data = {
    type: "bilibili-video",
    bvid: normalizeBvid(meta.bvid),
    aid: normalizeNumericId(meta.aid),
    cid: normalizeNumericId(meta.cid),
    sourceUrl:
      typeof meta.sourceUrl === "string" && meta.sourceUrl.trim()
        ? normalizeHttps(meta.sourceUrl)
        : null,
  };
  if (!data.bvid && !data.aid && !data.cid && !data.sourceUrl) return "";
  return `<!-- tau:meta ${JSON.stringify(data)} -->`;
}

function parseDateMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return parseDateMs(numeric);
    }
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function randomHexStr(length: number): string {
  let value = "";
  while (value.length < length) {
    value += Math.floor(Math.random() * 16)
      .toString(16)
      .toUpperCase();
  }
  return value.slice(0, length);
}

function createBlsid(): string {
  return `${randomHexStr(8)}_${Date.now().toString(16).toUpperCase()}`;
}

function generateGaussianInteger(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
  return Math.round(z0 * std + mean);
}

function getDmImgList(): string {
  const x = Math.max(generateGaussianInteger(1245, 5), 0);
  const y = Math.max(generateGaussianInteger(1285, 5), 0);
  return JSON.stringify([
    {
      x: 3 * x + 2 * y,
      y: 4 * x - 5 * y,
      z: 0,
      timestamp: Math.max(generateGaussianInteger(30, 5), 0),
      type: 0,
    },
  ]);
}

function addDmVerifyInfo(params: string): string {
  const dmImgStr = Buffer.from("no webgl").toString("base64").slice(0, -2);
  return `${params}&dm_img_list=${encodeURIComponent(
    getDmImgList(),
  )}&dm_img_str=${dmImgStr}&dm_cover_img_str=${dmImgStr}`;
}

function getMixinKey(rawKey: string): string {
  return WBI_MIXIN_KEY_ENC_TAB.map((n) => rawKey[n] || "")
    .join("")
    .slice(0, 32);
}

function addWbiSignature(params: URLSearchParams, mixinKey: string): string {
  const wts = Math.round(Date.now() / 1000);
  params.set("wts", String(wts));
  params.sort();
  const query = params.toString();
  const wRid = crypto
    .createHash("md5")
    .update(`${query}${mixinKey}`)
    .digest("hex");
  return `${query}&w_rid=${wRid}`;
}

function buildCookie(credentials: BilibiliCredentials): string {
  if (!credentials.SESSDATA?.trim()) {
    throw new Error("请先在设置中配置 Bilibili 凭证（SESSDATA）");
  }
  const parts = [`SESSDATA=${credentials.SESSDATA.trim()}`];
  if (credentials.bfe_id?.trim()) {
    parts.push(`bfe_id=${credentials.bfe_id.trim()}`);
  }
  parts.push(`b_lsid=${createBlsid()}`);
  return parts.join("; ");
}

async function getCredentials(): Promise<BilibiliCredentials> {
  const setting = await userSettingModule.getSettingSnapshot();
  return setting?.integration?.bilibili?.credentials || {};
}

async function getAuthedContext() {
  const cookie = buildCookie(await getCredentials());
  const nav = await requestJson<BilibiliNavResponse>(
    "https://api.bilibili.com/x/web-interface/nav",
    {
      Referer: "https://www.bilibili.com/",
      Cookie: cookie,
    },
  );
  if (nav.code !== 0 || !nav.data?.isLogin) {
    throw new Error("Bilibili 登录已失效，请在设置中重新配置凭证");
  }
  const imgKey = nav.data.wbi_img?.img_url?.split("/").pop()?.split(".")[0];
  const subKey = nav.data.wbi_img?.sub_url?.split("/").pop()?.split(".")[0];
  return {
    cookie,
    mid: String(nav.data.mid || ""),
    name: nav.data.uname || "我的 B 站关注动态",
    mixinKey: imgKey && subKey ? getMixinKey(`${imgKey}${subKey}`) : "",
  };
}

export function buildBilibiliUserVideoUrl(uid: string): string {
  return `${USER_VIDEO_PREFIX}${encodeURIComponent(uid)}`;
}

export function parseBilibiliSpaceUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!/(^|\.)bilibili\.com$/i.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/(\d+)(?:\/|$)/);
    if (parsed.hostname.toLowerCase() !== "space.bilibili.com") return null;
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function parseLocalBilibiliFeedUrl(
  url: string,
): LocalBilibiliFeed | null {
  if (url === BILIBILI_FOLLOWINGS_DYNAMIC_URL) {
    return { type: "followings-dynamic" };
  }
  if (url.startsWith(USER_VIDEO_PREFIX)) {
    const uid = decodeURIComponent(url.slice(USER_VIDEO_PREFIX.length));
    if (/^\d+$/.test(uid)) {
      return { type: "user-video", uid };
    }
    throw new Error("B 站 UP 主 UID 不正确");
  }
  return null;
}

export function isLocalBilibiliFeedUrl(url: string): boolean {
  return parseLocalBilibiliFeedUrl(url) !== null;
}

async function getUserInfo(uid: string, cookie: string, mixinKey: string) {
  const params = new URLSearchParams({
    mid: uid,
    token: "",
    platform: "web",
    web_location: "1550101",
  });
  const query = mixinKey
    ? addWbiSignature(params, mixinKey)
    : params.toString();
  const response = await requestJson<any>(
    `https://api.bilibili.com/x/space/wbi/acc/info?${query}`,
    {
      Referer: `https://space.bilibili.com/${uid}/`,
      Cookie: cookie,
    },
  );
  if (response.code !== 0) {
    return { name: `UP ${uid}`, face: null };
  }
  return {
    name: response.data?.name || `UP ${uid}`,
    face: response.data?.face || null,
  };
}

function mapVideoItem(item: any, author: string): ParsedFeedEntry {
  const bvid = normalizeBvid(item.bvid);
  const aid = item.aid;
  const link =
    bvid && item.created > 1_589_990_400
      ? `https://www.bilibili.com/video/${bvid}`
      : `https://www.bilibili.com/video/av${aid}`;
  const cover = buildImageHtml(item.pic);
  const metaComment = buildBilibiliVideoMetaComment({
    bvid,
    aid,
    cid: item.cid,
  });
  const description = [metaComment, item.description, cover]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("<br>");
  return {
    id: bvid || String(aid || link),
    title: item.title || "(无标题视频)",
    link,
    description: item.description || null,
    contentHtml: description || null,
    creator: author,
    categories: [],
    published: item.created
      ? new Date(item.created * 1000).toUTCString()
      : null,
  };
}

async function fetchUserVideoFeed(uid: string): Promise<ParsedFeed> {
  const { cookie, mixinKey } = await getAuthedContext();
  const user = await getUserInfo(uid, cookie, mixinKey);
  const params = new URLSearchParams({
    mid: uid,
    ps: "30",
    tid: "0",
    pn: "1",
    keyword: "",
    order: "pubdate",
    platform: "web",
    web_location: "1550101",
    order_avoided: "true",
  });
  const baseQuery = addDmVerifyInfo(params.toString());
  const query = mixinKey
    ? addWbiSignature(new URLSearchParams(baseQuery), mixinKey)
    : baseQuery;
  const response = await requestJson<any>(
    `https://api.bilibili.com/x/space/wbi/arc/search?${query}`,
    {
      Referer: `https://space.bilibili.com/${uid}/video`,
      Cookie: cookie,
    },
  );
  if (response.code !== 0) {
    throw new Error(response.message || "获取 Bilibili 投稿失败");
  }
  const videos = response.data?.list?.vlist || [];
  return {
    title: `${user.name} 的 Bilibili 投稿`,
    description: `${user.name} 的 Bilibili 投稿`,
    link: `https://space.bilibili.com/${uid}/video`,
    entries: videos.map((item: any) => mapVideoItem(item, user.name)),
  };
}

function getDynamicRawTitle(card: any): string {
  return String(card?.title || card?.item?.title || "(无标题动态)");
}

function getDynamicDescription(card: any): string {
  return (
    card?.dynamic ||
    card?.desc ||
    card?.description ||
    card?.item?.description ||
    card?.item?.content ||
    card?.summary ||
    card?.intro ||
    ""
  );
}

function getDynamicImages(card: any): string {
  const images: string[] = [];
  const source = card?.item || card;
  if (Array.isArray(source?.pictures)) {
    images.push(
      ...source.pictures.map((pic: any) => buildImageHtml(pic.img_src)),
    );
  }
  if (Array.isArray(source?.image_urls)) {
    images.push(...source.image_urls.map((url: string) => buildImageHtml(url)));
  }
  images.push(buildImageHtml(source?.pic));
  images.push(buildImageHtml(source?.cover?.unclipped || source?.cover));
  images.push(buildImageHtml(source?.sketch?.cover_url));
  return images.filter(Boolean).join("");
}

function getDynamicAuthor(item: any, card: any): string | null {
  return (
    item?.desc?.user_profile?.info?.uname ||
    card?.user?.uname ||
    card?.owner?.name ||
    card?.author?.name ||
    null
  );
}

function getDynamicLink(item: any, card: any): string | null {
  const sourceUrl =
    normalizeHttps(
      card?.short_link_v2 ||
        card?.short_link ||
        card?.jump_url ||
        card?.uri ||
        card?.url,
    ) ||
    normalizeHttps(card?.item?.jump_url || card?.item?.uri || card?.item?.url);
  if (sourceUrl) return sourceUrl;

  const bvid = normalizeBvid(card?.bvid);
  const aid = normalizeNumericId(card?.aid || item?.desc?.rid);
  if (bvid) return `https://www.bilibili.com/video/${bvid}`;
  if (aid) return `https://www.bilibili.com/video/av${aid}`;
  const dynamicId =
    card?.dynamic_id_str ||
    item?.desc?.dynamic_id_str ||
    card?.dynamic_id ||
    item?.desc?.dynamic_id;
  if (dynamicId) return `https://t.bilibili.com/${dynamicId}`;
  return null;
}

function mapFollowingDynamicItem(item: any): ParsedFeedEntry | null {
  let card: any;
  try {
    card = typeof item.card === "string" ? JSON.parse(item.card) : item.card;
  } catch {
    return null;
  }
  const data = card?.apiSeasonInfo || (card?.item ? card.item : card);
  const origin = (() => {
    try {
      return typeof card?.origin === "string" ? JSON.parse(card.origin) : null;
    } catch {
      return null;
    }
  })();
  const rawDescription = getDynamicDescription(data);
  const shortDescription = truncateText(
    rawDescription,
    DYNAMIC_DESCRIPTION_MAX_LENGTH,
  );
  const contentText = truncateText(
    card?.new_desc || rawDescription,
    DYNAMIC_CONTENT_TEXT_MAX_LENGTH,
  );
  const rawTitle = getDynamicRawTitle(data);
  const author = getDynamicAuthor(item, data);
  const title =
    rawTitle === "(无标题动态)"
      ? `${author ? `${author}的` : ""}${getDynamicTypeName(item)}`
      : truncateText(rawTitle, DYNAMIC_TITLE_MAX_LENGTH);
  const description = [
    buildBilibiliVideoMetaComment({
      bvid: data?.bvid,
      aid: data?.aid || item?.desc?.rid,
      cid: data?.cid,
      sourceUrl: getDynamicLink(item, data),
    }),
    contentText ? htmlEscape(contentText) : "",
    origin
      ? `//转发自: @${htmlEscape(getDynamicAuthor({}, origin) || "")}: ${htmlEscape(
          truncateText(
            getDynamicRawTitle(origin?.item || origin),
            DYNAMIC_TITLE_MAX_LENGTH,
          ),
        )}<br>${htmlEscape(
          truncateText(
            getDynamicDescription(origin?.item || origin),
            DYNAMIC_DESCRIPTION_MAX_LENGTH,
          ),
        )}`
      : "",
    getDynamicImages(data),
    origin ? getDynamicImages(origin?.item || origin) : "",
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join("<br>");
  const link = getDynamicLink(item, data);
  return {
    id: String(
      item?.desc?.dynamic_id_str ||
        data?.dynamic_id_str ||
        item?.desc?.dynamic_id ||
        data?.dynamic_id ||
        link ||
        "",
    ),
    title,
    link,
    description: shortDescription || null,
    contentHtml: description || null,
    creator: author,
    categories: [],
    published: item?.desc?.timestamp
      ? new Date(item.desc.timestamp * 1000).toUTCString()
      : null,
  };
}

export const __rssBilibiliInternals = {
  mapFollowingDynamicItem,
};

async function fetchFollowingsDynamicFeed(): Promise<ParsedFeed> {
  const { cookie, mid, name } = await getAuthedContext();
  if (!mid) {
    throw new Error("无法获取 Bilibili 登录用户 ID，请在设置中重新配置凭证");
  }
  const response = await requestJson<any>(
    `https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/dynamic_new?uid=${mid}&type_list=268435455`,
    {
      Referer: `https://space.bilibili.com/${mid}/`,
      Cookie: cookie,
    },
  );
  if (response.code === -6) {
    throw new Error("Bilibili Cookie 已过期，请在设置中重新配置凭证");
  }
  if (response.code !== 0) {
    throw new Error(response.message || "获取 Bilibili 关注动态失败");
  }
  const cards = response.data?.cards || [];
  return {
    title: `${name} 关注的 Bilibili 动态`,
    description: `${name} 关注的 Bilibili 动态`,
    link: "https://t.bilibili.com",
    entries: cards
      .map((item: any) => mapFollowingDynamicItem(item))
      .filter((entry: ParsedFeedEntry | null): entry is ParsedFeedEntry =>
        Boolean(entry?.id),
      ),
  };
}

export async function fetchBilibiliFeed(url: string): Promise<ParsedFeed> {
  const parsed = parseLocalBilibiliFeedUrl(url);
  if (!parsed) {
    throw new Error("不是支持的本地 Bilibili Feed");
  }
  if (parsed.type === "user-video") {
    return fetchUserVideoFeed(parsed.uid);
  }
  return fetchFollowingsDynamicFeed();
}

export async function previewBilibiliFeed(
  url: string,
): Promise<BilibiliFeedPreview> {
  const feed = await fetchBilibiliFeed(url);
  return {
    title: feed.title || url,
    siteUrl: feed.link,
    description: feed.description,
    entriesPreview: feed.entries.slice(0, 5).map((entry) => ({
      title: entry.title || "(无标题)",
      url: entry.link,
      publishedAt: parseDateMs(entry.published),
    })),
  };
}
