import { useMemo } from "react";
import { Editor } from "@tau/editor";
import { getMobilePluginDocumentKit } from "../../../services/editorKit";
import { toPluginDocument } from "../../../services/pluginDocument";

/** 插件随包资料（README / CHANGELOG）的只读展示，与笔记使用同一编辑器渲染。 */
export function PluginMarkdown({ source }: { source: string }) {
  const value = useMemo(() => toPluginDocument(source), [source]);
  return (
    <div className="min-w-0">
      <Editor
        key={source}
        kit={getMobilePluginDocumentKit()}
        initValue={value}
        readonly
        className="mobile-card-editor-content text-[14px]"
      />
    </div>
  );
}
