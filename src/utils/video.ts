const HTTP_REMOTE_REGEX = /^https?:\/\//i;
const LOCALHOST_REGEX = /^https?:\/\/localhost/i;
const VIDEO_EXTENSIONS = [
  "mp4",
  "webm",
  "mov",
  "mkv",
  "avi",
  "flv",
  "wmv",
  "m4v",
  "ts",
];

export const shouldUseLocalVideoCache = (
  src: string | null | undefined,
  autoCacheRemote: boolean,
) => {
  if (!src) {
    return true;
  }

  if (!HTTP_REMOTE_REGEX.test(src)) {
    return true;
  }

  if (LOCALHOST_REGEX.test(src)) {
    return true;
  }

  return autoCacheRemote;
};

const getExtensionFromSource = (src: string) => {
  try {
    const url = new URL(src);
    const pathname = url.pathname.toLowerCase();
    return pathname.split(".").pop() || "";
  } catch {
    const cleaned = src.split("?")[0].toLowerCase();
    const parts = cleaned.split(".");
    return parts.length > 1 ? parts.pop() || "" : "";
  }
};

export const isLikelyVideoSource = (src: string) => {
  const extension = getExtensionFromSource(src);
  if (!extension) {
    return false;
  }
  return VIDEO_EXTENSIONS.includes(extension);
};
