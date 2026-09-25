/**
 * 思维导图块（D-057）：列表语法 → 导图。更多菜单：复制到白板、导出 PNG。
 * 流式生成时导图组件自带 500ms 防抖，保留上次渲染结果。
 */

import { useRef, useState } from "react";
import { Copy, FileImage, Network } from "lucide-react";
import { toast } from "@tau/ui";
import MindMapRenderer from "@/layouts/ContentLayout/components/ChatSidebar/MindMapRenderer";
import type { MindMapRef } from "@/components/MindMap";
import { copyElementsToClipboard } from "@/utils/clipboardHelpers";
import { captureBlobWithSnapdom } from "@/utils/snapdom-export";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { usePreviewActions } from "@/features/previews/components/previewActions";
import { downloadBlob, safeFileName } from "@/features/previews/exportImage";

const nextFrame = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** 截图前把画布撑到内容实际尺寸、去掉变换，截完还原 */
async function captureCanvas(root: HTMLElement): Promise<Blob> {
  const svg = root.querySelector<SVGSVGElement>("svg.pointer-events-none");
  const target = (svg?.parentElement as HTMLElement | null) ?? root;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error("思维导图尚未渲染完成");
  const keys = [
    "width",
    "height",
    "maxHeight",
    "overflow",
    "transform",
    "transformOrigin",
    "background",
  ] as const;
  const saved = Object.fromEntries(keys.map(k => [k, target.style[k]]));
  const computed = getComputedStyle(target);
  try {
    target.style.width = `${Math.ceil(parseFloat(computed.width) || rect.width)}px`;
    target.style.height = `${Math.ceil(parseFloat(computed.height) || rect.height)}px`;
    target.style.maxHeight = "none";
    target.style.overflow = "visible";
    target.style.transform = "none";
    target.style.transformOrigin = "top left";
    if (!target.style.background) target.style.background = computed.backgroundColor || "#ffffff";
    await nextFrame();
    return await captureBlobWithSnapdom(target, {
      dpr: window.devicePixelRatio || 2,
      type: "png",
      quality: 0.95,
    });
  } finally {
    keys.forEach(k => (target.style[k] = saved[k]));
  }
}

function MindMapPreview({ block }: BlockPreviewProps) {
  const mindMapRef = useRef<MindMapRef>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  usePreviewActions({
    more: [
      {
        key: "to-whiteboard",
        label: "复制到白板",
        icon: Copy,
        onSelect: async () => {
          const tree = mindMapRef.current?.getLayoutTree();
          if (!tree) throw new Error("无法获取思维导图数据");
          await copyElementsToClipboard([tree]);
        },
      },
      {
        key: "png",
        label: "导出 PNG",
        icon: FileImage,
        disabled: busy,
        onSelect: async () => {
          if (!boxRef.current) return;
          setBusy(true);
          try {
            const blob = await captureCanvas(boxRef.current);
            downloadBlob(blob, `${safeFileName(block.metadata.title || "思维导图")}.png`);
            toast.success("图片已导出");
          } finally {
            setBusy(false);
          }
        },
      },
    ],
  });

  return (
    <div ref={boxRef} className="relative size-full">
      <MindMapRenderer ref={mindMapRef} code={block.content} fillContainer />
    </div>
  );
}

export default defineBlockRenderer({
  type: "mind-map",
  label: "思维导图",
  icon: Network,
  sourceLanguage: "markdown",
  title: content =>
    content
      .split("\n")
      .find(line => line.trim())
      ?.trim()
      .replace(/^[-*+]\s*/, "")
      .replace(/^#+\s*/, ""),
  Preview: MindMapPreview,
});
