/**
 * HTML 块（D-057）：模型生成的完整网页。
 *
 * 沙箱：iframe srcdoc + sandbox="allow-scripts allow-forms allow-modals"——不给 same-origin，
 * 页面是不透明源，碰不到应用本身与其它预览的存储；不给 popups / top-navigation。
 * 页面里的外链由注入的小脚本拦下，经 postMessage 交给系统浏览器打开。
 * 生成中先看源码（streaming: source-first），写完切预览，避免半截页面反复重载。
 */

import { useEffect, useRef, useState } from "react";
import { Download, Globe, RotateCw, Smartphone } from "lucide-react";
import { toast } from "@tau/ui";
import { openExternal } from "@/commands";
import { defineBlockRenderer, type BlockPreviewProps } from "@/types/block-preview";
import { usePreviewActions } from "@/features/previews/components/previewActions";

const LINK_MESSAGE = "tau-block-open-link";

/** 注入到页面最前：外链一律交给宿主（系统浏览器），页内锚点照常 */
const LINK_BRIDGE = `<script>document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href")||"";if(/^(https?:|mailto:)/i.test(h)){e.preventDefault();parent.postMessage({type:"${LINK_MESSAGE}",href:a.href},"*");}},true);</script>`;

export function withLinkBridge(html: string): string {
  const head = /<head[^>]*>/i.exec(html);
  if (head)
    return (
      html.slice(0, head.index + head[0].length) +
      LINK_BRIDGE +
      html.slice(head.index + head[0].length)
    );
  return LINK_BRIDGE + html;
}

const titleOf = (content: string) => /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content)?.[1]?.trim();

function HtmlPreview({ block }: BlockPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mobile, setMobile] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; href?: string } | null;
      if (data?.type !== LINK_MESSAGE || typeof data.href !== "string") return;
      if (!/^(https?:|mailto:)/i.test(data.href)) return;
      openExternal(data.href).catch(() => toast.error("打开链接失败"));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const download = () => {
    const base = (block.metadata.title || "page").replace(/[\\/:*?"<>|]/g, "_");
    const url = URL.createObjectURL(new Blob([block.content], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = base.endsWith(".html") ? base : `${base}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  usePreviewActions({
    tools: [
      {
        key: "mobile",
        label: mobile ? "桌面预览" : "移动端预览",
        icon: Smartphone,
        active: mobile,
        onSelect: () => setMobile(v => !v),
      },
      { key: "reload", label: "刷新", icon: RotateCw, onSelect: () => setReloadKey(k => k + 1) },
    ],
    more: [{ key: "download", label: "下载 .html", icon: Download, onSelect: download }],
  });

  const frame = (
    <iframe
      key={reloadKey}
      ref={frameRef}
      title={block.metadata.title || "HTML 预览"}
      srcDoc={withLinkBridge(block.content)}
      sandbox="allow-scripts allow-forms allow-modals"
      className="block size-full border-0 bg-white"
    />
  );

  if (!mobile) return frame;
  return (
    <div className="bg-page grid h-full place-items-center overflow-auto py-4">
      <div className="shadow-float h-[min(760px,100%)] w-[390px] max-w-full overflow-hidden rounded-[26px] border-[6px] border-[#1b1813]">
        {frame}
      </div>
    </div>
  );
}

export default defineBlockRenderer({
  type: "html",
  label: "HTML",
  icon: Globe,
  sourceLanguage: "markup",
  streaming: "source-first",
  surface: "white",
  accept: content => /^<!DOCTYPE\s+html>/i.test(content.trim()),
  title: titleOf,
  Preview: HtmlPreview,
});
