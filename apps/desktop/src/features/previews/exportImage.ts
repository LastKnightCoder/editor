/**
 * 块预览的导出小工具（D-057）：下载 Blob、SVG → PNG。
 * 画布类（导图 / 白板）截图仍走 utils/snapdom-export。
 */

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** SVG 元素 → 2x PNG（白底，免得透明底在看图软件里发黑） */
export async function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const box = svg.getBBox();
  const width = Math.ceil(box.width || svg.clientWidth || 800);
  const height = Math.ceil(box.height || svg.clientHeight || 600);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `${box.x} ${box.y} ${width} ${height}`);
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml;charset=utf-8",
    })
  );
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("图片转换失败"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建画布");
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error("导出失败"))), "image/png")
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
