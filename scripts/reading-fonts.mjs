/** R2 上移动端正文字体目录；客户端设置页与下载都读这里的 manifest.json */
export const FONT_PREFIX = "fonts";
export const FONT_MANIFEST_NAME = "manifest.json";

/**
 * 上游字体源：URL 固定到发布 tag，sha256 是上游文件（字体与许可）本身的摘要，下载后核对，防止上游被替换。
 * 换上游版本时同时改 version、URL 与摘要；style 进文件名，weight 是 CSS font-weight 描述符。
 */
export const READING_FONT_SOURCES = [
  {
    id: "lxgw-wenkai",
    name: "霞鹜文楷",
    version: "1.530",
    license: {
      url: "https://github.com/lxgw/LxgwWenKai-Screen/raw/v1.530/OFL.txt",
      sha256: "ba38832f9d7e0ad601a1ab90d58f251ba957532885ef80dca050a611962fd8b6",
    },
    files: [
      {
        style: "regular",
        weight: "400",
        url: "https://github.com/lxgw/LxgwWenKai-Screen/releases/download/v1.530/LXGWWenKaiScreen.ttf",
        sha256: "abd13364163e3cd84372b333f2fdcee9efb848634668f1c0ce5788dcd059ee61",
      },
    ],
  },
  {
    id: "noto-serif-sc",
    name: "思源宋体",
    version: "2.003",
    license: {
      url: "https://github.com/notofonts/noto-cjk/raw/Serif2.003/Serif/LICENSE",
      sha256: "6a73f9541c2de74158c0e7cf6b0a58ef774f5a780bf191f2d7ec9cc53efe2bf2",
    },
    files: [
      {
        style: "variable",
        weight: "200 900",
        url: "https://github.com/notofonts/noto-cjk/raw/Serif2.003/Serif/Variable/OTF/Subset/NotoSerifSC-VF.otf",
        sha256: "71b4d3ded2d90ff43bb75a4e48cdbe170f0b8d5486dc89ff87f2a1728b56da64",
      },
    ],
  },
];

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VERSION_RE = /^\d+(\.\d+)*$/;
const STYLE_RE = /^[a-z]+$/;
const WEIGHT_RE = /^\d{3}( \d{3})?$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export function fontFileName(id, version, style) {
  return `${id}-${version}-${style}.woff2`;
}

export function licenseFileName(id, version) {
  return `${id}-${version}-LICENSE.txt`;
}

/** 字体源自检：发布前拦住手写错误，规则与客户端校验清单的规则一致 */
export function assertFontSources(sources) {
  const ids = new Set();
  for (const source of sources) {
    if (!ID_RE.test(source.id)) throw new Error(`字体 id 不合法: ${source.id}`);
    if (ids.has(source.id)) throw new Error(`字体 id 重复: ${source.id}`);
    ids.add(source.id);
    if (!VERSION_RE.test(source.version)) {
      throw new Error(`${source.id} 版本号不合法: ${source.version}`);
    }
    if (!source.name) throw new Error(`${source.id} 缺少显示名`);
    if (!source.license?.url || !SHA256_RE.test(source.license.sha256 ?? "")) {
      throw new Error(`${source.id} 许可文件地址或摘要不合法`);
    }
    if (source.files.length === 0) throw new Error(`${source.id} 没有字体文件`);
    const styles = new Set();
    for (const file of source.files) {
      if (!STYLE_RE.test(file.style) || styles.has(file.style)) {
        throw new Error(`${source.id} 字重文件 style 不合法或重复: ${file.style}`);
      }
      styles.add(file.style);
      if (!WEIGHT_RE.test(file.weight)) {
        throw new Error(`${source.id}/${file.style} weight 不合法: ${file.weight}`);
      }
      if (!SHA256_RE.test(file.sha256)) {
        throw new Error(`${source.id}/${file.style} 上游摘要不合法`);
      }
    }
  }
}

/**
 * 由字体源与产物信息生成线上清单。built 以 `${id}/${style}` 为键给出 WOFF2 的 size 与 sha256；
 * 清单只描述客户端需要的字段，上游地址不进清单。
 */
export function buildFontManifest(sources, built) {
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    version: source.version,
    license: licenseFileName(source.id, source.version),
    files: source.files.map(file => {
      const output = built[`${source.id}/${file.style}`];
      if (!output) throw new Error(`缺少 ${source.id}/${file.style} 的构建产物`);
      return {
        style: file.style,
        weight: file.weight,
        file: fontFileName(source.id, source.version, file.style),
        size: output.size,
        sha256: output.sha256,
      };
    }),
  }));
}

/** 线上清单里同 id 同版本且摘要一致的字体无需重传文件（文件 key 带版本，内容不可变） */
export function unchangedFontIds(remote, next) {
  if (!Array.isArray(remote)) return new Set();
  const sameFiles = (left, right) =>
    left.length === right.length &&
    left.every(
      (file, index) => file.file === right[index].file && file.sha256 === right[index].sha256
    );
  return new Set(
    next
      .filter(font =>
        remote.some(
          item =>
            item?.id === font.id &&
            item.version === font.version &&
            Array.isArray(item.files) &&
            sameFiles(item.files, font.files)
        )
      )
      .map(font => font.id)
  );
}
