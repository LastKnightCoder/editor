import { useEffect, useMemo, useRef } from "react";
import type { Descendant } from "slate";
import { Awareness } from "y-protocols/awareness";
import { createSharedDocument } from "@tau/collaboration/src/document";
import type { ContentNode } from "@tau/collaboration/src/protocol";
import { createYjsDocument, type EditorCollaborationBinding } from "@tau/editor-collab";
import type { EditorDocument } from "@tau/editor/src";
import { normalizeEditorContent } from "../features/cards/editorContentUtils";

/** 内容谱系：本机编辑与协作编辑用同一个值，编辑器据此走换源而不是重建（01 §7.3 第 3 层） */
export const contentLineage = (contentId?: number) => `content:${contentId ?? 0}`;

/**
 * 本机编辑的文档源：内容装进一个 local 模式的 Y.Doc。
 *
 * 这样协作与本机是同一种文档源，「连接失败回落本机」「结束共享」就是同谱系换源——
 * 同一个编辑器实例上换文档源，块组件不重新挂载、选区保留。改动仍经 `onChange` 落本地库。
 */
export default function useLocalContentDocument(options: {
  contentId?: number;
  content: Descendant[];
  /** 内容被外部更新（重拉、其它视图同步）时递增；变化即重建本机文档 */
  version: number;
  onChange: (value: Descendant[]) => void;
}): EditorDocument | undefined {
  const { contentId, content, version, onChange } = options;
  // 内容与回调都只在重建时取一次：之后内容以 Y.Doc 为准，回调经 ref 保持最新
  const latest = useRef({ content, onChange });
  latest.current = { content, onChange };

  const created = useMemo(() => {
    if (!contentId) return undefined;
    const doc = createSharedDocument(
      {
        title: "",
        content: normalizeEditorContent(latest.current.content) as unknown as ContentNode[],
        bannerBg: "",
        bannerPosition: "center",
      },
      undefined,
      "local"
    );
    const binding: EditorCollaborationBinding = {
      mode: "local",
      role: "owner",
      doc,
      awareness: new Awareness(doc),
      origin: {},
      privateNodes: new Map(),
      // 本机模式下资源走 kit 自己的资源服务，binding 的这两项不会被调用
      uploadResource: async () => {
        throw new Error("本机编辑不经协作通道上传资源");
      },
      resolveResource: async url => url,
    };
    return {
      doc,
      document: createYjsDocument(binding, {
        lineage: contentLineage(contentId),
        cursors: false,
        onChange: value => latest.current.onChange(value),
      }),
    };
  }, [contentId, version]);

  // 换源或卸载后销毁旧文档：编辑器的 disconnect 先于这里执行（子组件的清理在前）
  useEffect(() => {
    const doc = created?.doc;
    return () => doc?.destroy();
  }, [created]);

  return created?.document;
}
