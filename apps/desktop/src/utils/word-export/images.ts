import { ImageRun } from "docx";
import { isRemoteUrl, readAssetBytes } from "@/utils/content-transfer/assets";
import { remoteResourceToLocal } from "@/utils/resouce";

function sizedSvg(element: Element, width: number, height: number) {
  const svg = element.cloneNode(true) as Element;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  return svg;
}

// DOCX 中的矢量公式只收自包含的静态几何；其他 SVG 仍在图片解码环境内栅格化。
function formulaVector(svg: Element): Uint8Array | undefined {
  for (const node of [svg, ...svg.querySelectorAll("*")]) {
    if (
      ![
        "svg",
        "g",
        "path",
        "rect",
        "line",
        "circle",
        "ellipse",
        "polygon",
        "polyline",
        "text",
        "tspan",
        "title",
      ].includes(node.localName)
    )
      return;
    for (const attr of Array.from(node.attributes)) {
      if (
        attr.name.startsWith("data-") ||
        ["role", "focusable"].includes(attr.name) ||
        (attr.name === "style" && /^vertical-align:\s*-?[\d.]+ex;?$/i.test(attr.value))
      ) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (
        ![
          "xmlns",
          "width",
          "height",
          "viewBox",
          "d",
          "x",
          "y",
          "x1",
          "x2",
          "y1",
          "y2",
          "cx",
          "cy",
          "r",
          "rx",
          "ry",
          "points",
          "transform",
          "fill",
          "stroke",
          "stroke-width",
          "font-size",
          "font-family",
          "text-anchor",
          "preserveAspectRatio",
        ].includes(attr.name)
      )
        return;
      if (
        ["stroke", "fill"].includes(attr.name) &&
        !/^(?:[a-z]+|#[0-9a-f]{3,8}|rgba?\([\d., %]+\))$/i.test(attr.value)
      )
        return;
      if (attr.value === "currentColor") node.setAttribute(attr.name, "#000000");
    }
  }
  return new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
}

export async function embedImage(
  element: Element,
  maxWidth: number,
  localSources: ReadonlySet<string>,
  assetDirectory?: string
): Promise<ImageRun> {
  const src = element.getAttribute("src") || "";
  const formula = element.localName === "svg" && !!element.closest(".block-math,.inline-math");
  let blob: Blob;
  if (element.localName === "svg") {
    blob = new Blob([new XMLSerializer().serializeToString(element)], { type: "image/svg+xml" });
  } else {
    if (!isRemoteUrl(src) && !src.startsWith("data:image/") && !localSources.has(src))
      throw new Error("找不到正文引用的图片");
    const relative = assetDirectory && !/^(?:[a-z][a-z0-9+.-]*:|[\\/~])/i.test(src);
    const path = relative ? assetDirectory + "/" + src : src;
    const { bytes, mimeType } = await readAssetBytes(
      isRemoteUrl(src) ? await remoteResourceToLocal(src) : path
    );
    blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  }
  const url = URL.createObjectURL(blob);
  let previewUrl: string | undefined;
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const requested = parseFloat(element.getAttribute("width") || "");
    const width = Math.max(
      1,
      Math.min(
        maxWidth,
        Number.isFinite(requested) && element.getAttribute("width")?.match(/^\d+(\.\d+)?(px)?$/)
          ? requested
          : image.naturalWidth,
        (850 * image.naturalWidth) / image.naturalHeight
      )
    );
    const height = Math.max(1, Math.round((width * image.naturalHeight) / image.naturalWidth));
    const canvas = document.createElement("canvas");
    const scale = formula ? 4 : Math.min(2, image.naturalWidth / width);
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法生成图片");
    if (formula) {
      const preview = sizedSvg(element, canvas.width, canvas.height);
      previewUrl = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(preview)], { type: "image/svg+xml" })
      );
      image.src = previewUrl;
      await image.decode();
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        result => (result ? resolve(result) : reject(new Error("图片转换失败"))),
        "image/png"
      )
    );
    const alt = element.getAttribute("alt") || (formula ? "数学公式" : "图片");
    const fallback = { data: new Uint8Array(await png.arrayBuffer()), type: "png" as const };
    const transformation = { width: Math.round(width), height };
    const vector = formula && formulaVector(sizedSvg(element, transformation.width, height));
    return new ImageRun({
      ...(vector ? { type: "svg", data: vector, fallback } : fallback),
      transformation,
      altText: { name: alt, title: alt, description: alt },
    });
  } finally {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    URL.revokeObjectURL(url);
  }
}
