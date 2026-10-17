import { useMemo } from "react";
import { Editor } from "@tau/editor";
import { getPluginDocumentKit } from "@/services/editorKit";
import { toPluginDocument } from "../pluginDocument";

/** 插件随包资料（README / CHANGELOG）的只读展示，与笔记使用同一编辑器渲染。 */
export function PluginMarkdown({ source }: { source: string }) {
  const value = useMemo(() => toPluginDocument(source), [source]);
  return (
    <div className="min-w-0">
      <Editor
        key={source}
        kit={getPluginDocumentKit()}
        initValue={value}
        readonly
        className="text-tau-body"
      />
    </div>
  );
}
