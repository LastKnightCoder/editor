const SAMPLE_SIZE = 32;
/** alpha 低于该值视为透明（留出位图压缩的轻微误差） */
const OPAQUE_ALPHA = 250;

const cache = new Map<string, Promise<boolean>>();

export const isSvgUrl = (url: string) =>
  /^data:image\/svg\+xml/i.test(url) || /\.svg(?:[?#]|$)/i.test(url);

/** 以 CORS 方式重新加载位图并缩小采样；跨域不可读（画布被污染）或加载失败时按不透明处理 */
function sampleTransparency(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const context = canvas.getContext("2d");
        if (!context) return resolve(false);
        context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] < OPAQUE_ALPHA) return resolve(true);
        }
        resolve(false);
      } catch {
        resolve(false);
      }
    };
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

/** 图片是否含透明像素（按地址缓存）：SVG 直接视为透明，位图采样判定 */
export function detectImageTransparency(url: string): Promise<boolean> {
  let pending = cache.get(url);
  if (!pending) {
    pending = isSvgUrl(url) ? Promise.resolve(true) : sampleTransparency(url);
    cache.set(url, pending);
  }
  return pending;
}
