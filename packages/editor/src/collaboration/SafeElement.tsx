import type { RenderElementProps } from "slate-react";
import { PRIVATE_BLOCKS } from "@tau/collaboration";

/**
 * 协作安全渲染：私有块（白板、数据库等）的数据归创建者本机所有，
 * 不参与共享，远端一律显示占位说明。源码类块（html/custom-block 等）
 * 与普通模式使用相同的渲染器，保证实时预览。
 */
export const requiresSafeRendering = (type: string) =>
  PRIVATE_BLOCKS.has(type) || type === "collaboration-placeholder";

export default function SafeCollaborationElement({
  element,
  attributes,
  children,
}: RenderElementProps) {
  const node = element as unknown as Record<string, unknown>;
  const type = String(node.type);
  return (
    <div
      {...attributes}
      contentEditable={false}
      className="border-border-1 bg-bg-page text-text-3 my-1.5 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-[13px]"
      title="该内容依赖本机数据，不参与共享"
    >
      <i className="bg-status-warning h-[7px] w-[7px] flex-none rounded-full" />
      {String(node.label || type)} 未共享，仅保存在创建者本机
      <span style={{ display: "none" }}>{children}</span>
    </div>
  );
}
