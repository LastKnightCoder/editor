/** 读取网页的标题、描述、封面与图标；请求经宿主跨域 fetch，解析在渲染进程。 */

export interface LinkPreview {
  /** 跟随重定向后的最终地址 */
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
  icon?: string;
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
/** 反爬、登录拦截页的标题：当作没读到 */
const BLOCKED_TITLE =
  /^(安全验证|验证码|人机验证|请稍候|登录|请登录|access denied|attention required|just a moment|captcha|sign in|log in)/i;

const pickMeta = (doc: Document, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const node = doc.querySelector(`meta[property="${key}" i], meta[name="${key}" i]`);
    const value = node?.getAttribute("content")?.trim();
    if (value) return value;
  }
  return undefined;
};

const absolute = (value: string | undefined, base: string): string | undefined => {
  if (!value) return undefined;
  try {
    const resolved = new URL(value, base);
    return resolved.protocol === "http:" || resolved.protocol === "https:"
      ? resolved.href
      : undefined;
  } catch {
    return undefined;
  }
};

const pickIcon = (doc: Document, base: string): string | undefined => {
  const links = [...doc.querySelectorAll<HTMLLinkElement>("link[rel][href]")];
  const byRel = (match: (rel: string) => boolean) =>
    links
      .find(link => match((link.getAttribute("rel") ?? "").toLowerCase()))
      ?.getAttribute("href") ?? undefined;
  const href =
    byRel(rel => rel.includes("apple-touch-icon")) ??
    byRel(rel => rel.split(/\s+/).includes("icon"));
  return absolute(href ?? "/favicon.ico", base);
};

/** 从 HTML 文本提取网页信息；base 为最终地址，用于补全相对地址。 */
export function parseLinkPreview(html: string, base: string): LinkPreview {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const baseHref = absolute(
    doc.querySelector("base[href]")?.getAttribute("href") ?? undefined,
    base
  );
  const root = baseHref ?? base;
  const title =
    pickMeta(doc, ["og:title", "twitter:title"]) ?? doc.querySelector("title")?.textContent?.trim();
  const blocked = !!title && BLOCKED_TITLE.test(title);
  return {
    url: base,
    title: blocked ? undefined : title || undefined,
    description: blocked
      ? undefined
      : pickMeta(doc, ["og:description", "twitter:description", "description"]),
    siteName: pickMeta(doc, ["og:site_name", "application-name"]),
    image: blocked
      ? undefined
      : absolute(
          pickMeta(doc, ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]),
          root
        ),
    icon: pickIcon(doc, root),
  };
}

const charsetOf = (contentType: string | null): string | undefined =>
  contentType?.match(/charset=["']?([\w-]+)/i)?.[1];

/** 先按 Content-Type 解码，没有声明时读 `<meta charset>` 再解码一次。 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const decode = (label: string) => {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      return undefined;
    }
  };
  const utf8 = () => new TextDecoder().decode(bytes);
  const declared = charsetOf(contentType);
  if (declared) return decode(declared) ?? utf8();
  const ascii = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const meta =
    ascii.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    ascii.match(/<meta[^>]+content=["'][^"']*charset=([\w-]+)/i)?.[1];
  return (meta && decode(meta)) || utf8();
}

async function readHead(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(await response.arrayBuffer()).subarray(0, MAX_BYTES);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      // </head> 之后不再有 meta 信息
      if (new TextDecoder("latin1").decode(value).toLowerCase().includes("</head>")) break;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(Math.min(size, MAX_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
    if (offset >= bytes.length) break;
  }
  return bytes;
}

/** 合并调用方取消与超时；不依赖 AbortSignal.any（部分 WebView 与测试环境没有） */
const withTimeout = (signal?: AbortSignal): AbortSignal => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("读取超时", "TimeoutError")),
    TIMEOUT_MS
  );
  const forward = () => controller.abort(signal?.reason);
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
    { once: true }
  );
  return controller.signal;
};

/** 读取网页信息；网络错误、非 HTML、非 2xx 返回 null，不抛错（调用方取消除外）。 */
export async function readLinkPreview(
  fetcher: typeof fetch,
  url: string,
  signal?: AbortSignal
): Promise<LinkPreview | null> {
  try {
    const response = await fetcher(url, {
      signal: withTimeout(signal),
      redirect: "follow",
      credentials: "omit",
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type");
    if (type && !/html|xml/i.test(type)) return null;
    const html = decodeHtml(await readHead(response), type);
    return parseLinkPreview(html, response.url || url);
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/avif": "avif",
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 下载图片为 File，供资源服务存储；不是图片或过大返回 null。 */
export async function downloadImage(
  fetcher: typeof fetch,
  url: string,
  name: string,
  signal?: AbortSignal
): Promise<File | null> {
  try {
    const response = await fetcher(url, { signal: withTimeout(signal), credentials: "omit" });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) return null;
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return new File([bytes], `${name}.${EXTENSIONS[type] ?? "img"}`, { type });
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}
