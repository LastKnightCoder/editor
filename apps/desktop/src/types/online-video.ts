import type { JsonValue, VideoRef } from "@tau/plugins";

/** 宿主在视频元数据中占用的键，其余字段属于提供方插件的引用。 */
const RESERVED_KEYS = new Set(["type", "title", "thumbnail"]);
/** 宿主自有的视频来源；其他 type 即在线视频提供方插件 ID。 */
const HOST_VIDEO_TYPES = new Set(["local", "remote"]);

/** 在线视频元数据：type 为提供方插件 ID，引用字段由插件解释。 */
export interface OnlineVideoMetaInfo {
  type: string;
  title?: string;
  thumbnail?: string;
  [key: string]: unknown;
}

export const isOnlineVideoType = (type: unknown): type is string =>
  typeof type === "string" && type.length > 0 && !HOST_VIDEO_TYPES.has(type);

export function onlineVideoRef(meta: Record<string, unknown>): VideoRef {
  const ref: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(meta))
    if (!RESERVED_KEYS.has(key) && value !== undefined) ref[key] = value as JsonValue;
  return ref;
}

export function buildOnlineVideoMeta(
  providerId: string,
  ref: VideoRef,
  title?: string,
  thumbnail?: string
): OnlineVideoMetaInfo {
  return {
    ...onlineVideoRef(ref),
    type: providerId,
    ...(title ? { title } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  };
}
