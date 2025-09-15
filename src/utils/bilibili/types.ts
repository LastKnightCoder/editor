export interface BilibiliVideoInfo {
  bvid: string;
  cid: string;
  title: string;
  cover: string;
  duration: string; // 格式化后的时长，如 "10:30"
  view: number;
  danmaku: number;
  reply: number;
  up: Array<{
    name: string;
    mid: number;
  }>;
  qualityOptions: Array<{
    label: string;
    value: number;
  }>;
  pages: BilibiliPage[];
}

export interface BilibiliPage {
  title: string;
  url: string;
  page: number;
  duration: string;
  cid: string;
  bvid: string;
}

export interface BilibiliQualityInfo {
  accept_quality: number[];
  video: Array<{
    id: number;
    cid: string;
    url: string;
  }>;
  audio: Array<{
    id: number;
    cid: string;
    url: string;
  }>;
}

export interface BilibiliPlayUrl {
  video: string;
  audio: string;
  quality: number;
}

export interface BilibiliSubtitle {
  title: string;
  url: string;
}

export interface BilibiliCredentials {
  SESSDATA: string;
  bfe_id?: string;
}

export interface BilibiliUserInfo {
  name: string;
  avatar: string;
  isLogin: boolean;
  vipStatus: number; // 0: 游客，1：普通用户，2：大会员
}

export interface ParsedBilibiliUrl {
  type: "BV" | "ss" | "ep";
  bvid?: string;
  aid?: string;
  cid?: string;
  ssid?: string;
  epid?: string;
  page?: number;
  originalUrl: string;
}

export enum BilibiliVideoQuality {
  SPEED_240P = 6, // 240P 极速（仅 MP4 格式支持）
  FLUENT_360P = 16, // 360P 流畅
  CLEAR_480P = 32, // 480P 清晰
  HD_720P = 64, // 720P 高清（WEB 端默认值）
  HD_720P_60 = 74, // 720P60 高帧率（登录认证）
  HD_1080P = 80, // 1080P 高清（TV 端与 APP 端默认值，登录认证）
  SMART_REPAIR = 100, // 智能修复（人工智能增强画质，大会员认证）
  HD_1080P_PLUS = 112, // 1080P+ 高码率（大会员认证）
  HD_1080P_60 = 116, // 1080P60 高帧率（大会员认证）
  UHD_4K = 120, // 4K 超清（需要fnval&128=128且fourk=1，大会员认证）
  HDR = 125, // HDR 真彩色（仅支持 DASH 格式，需要fnval&64=64，大会员认证）
  DOLBY_VISION = 126, // 杜比视界（仅支持 DASH 格式，需要fnval&512=512，大会员认证）
  UHD_8K = 127, // 8K 超高清（仅支持 DASH 格式，需要fnval&1024=1024，大会员认证）
}

export const QUALITY_MAP: Record<number, string> = {
  [BilibiliVideoQuality.SPEED_240P]: "240P 极速",
  [BilibiliVideoQuality.FLUENT_360P]: "360P 流畅",
  [BilibiliVideoQuality.CLEAR_480P]: "480P 清晰",
  [BilibiliVideoQuality.HD_720P]: "720P 高清",
  [BilibiliVideoQuality.HD_720P_60]: "720P60 高帧率",
  [BilibiliVideoQuality.HD_1080P]: "1080P 高清",
  [BilibiliVideoQuality.SMART_REPAIR]: "智能修复",
  [BilibiliVideoQuality.HD_1080P_PLUS]: "1080P+ 高码率",
  [BilibiliVideoQuality.HD_1080P_60]: "1080P60 高帧率",
  [BilibiliVideoQuality.UHD_4K]: "4K 超清",
  [BilibiliVideoQuality.HDR]: "HDR 真彩色",
  [BilibiliVideoQuality.DOLBY_VISION]: "杜比视界",
  [BilibiliVideoQuality.UHD_8K]: "8K 超高清",
};

// 获取可选择的清晰度选项（基于可用清晰度数组）
export function getQualityOptions(acceptQuality: number[]): Array<{
  label: string;
  value: number;
  needLogin?: boolean;
  needVip?: boolean;
}> {
  return acceptQuality
    .map((quality) => {
      const label = QUALITY_MAP[quality] || `清晰度 ${quality}`;
      let needLogin = false;
      let needVip = false;

      // 根据清晰度设置权限要求
      if (quality >= 74) needLogin = true; // 720P60 及以上需要登录
      if (quality >= 100) needVip = true; // 智能修复及以上需要大会员

      return {
        label,
        value: quality,
        needLogin,
        needVip,
      };
    })
    .sort((a, b) => b.value - a.value); // 按清晰度从高到低排序
}

// API 响应类型
export interface BilibiliApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface BilibiliVideoApiData {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  pic: string;
  duration: number;
  owner: {
    name: string;
    mid: number;
  };
  staff?: Array<{
    name: string;
    mid: number;
  }>;
  stat: {
    view: number;
    danmaku: number;
    reply: number;
  };
  pages: Array<{
    cid: number;
    page: number;
    part: string;
    duration: number;
  }>;
}

export interface BilibiliPlayInfoApiData {
  accept_quality: number[];
  dash: {
    video: Array<{
      id: number;
      baseUrl: string;
      bandwidth: number;
      codecs: string;
    }>;
    audio: Array<{
      id: number;
      baseUrl: string;
      bandwidth: number;
      codecs: string;
      backupUrl?: string[];
    }>;
  };
}

export interface BilibiliUserNavApiData {
  isLogin: boolean;
  vipStatus: number;
  uname: string;
  face: string;
}

// 错误类型
export class BilibiliError extends Error {
  constructor(
    message: string,
    public code?: number,
    public originalError?: any,
  ) {
    super(message);
    this.name = "BilibiliError";
  }
}

export class BilibiliNetworkError extends BilibiliError {
  constructor(message = "网络请求失败", originalError?: any) {
    super(message, undefined, originalError);
    this.name = "BilibiliNetworkError";
  }
}

export class BilibiliAuthError extends BilibiliError {
  constructor(message = "身份验证失败", originalError?: any) {
    super(message, undefined, originalError);
    this.name = "BilibiliAuthError";
  }
}

export class BilibiliParseError extends BilibiliError {
  constructor(message = "数据解析失败", originalError?: any) {
    super(message, undefined, originalError);
    this.name = "BilibiliParseError";
  }
}
