import { lazy, Suspense } from "react";
import { Transforms } from "slate";
import { ReactEditor, useSlateStatic, useReadOnly } from "slate-react";
import { AddParagraph, type ElementRenderProps } from "@tau/editor";
import { canEditElement, useTextFieldBinding } from "@tau/editor/api";
import type { QueryDatabaseElement } from "./types";
import type { QueryPresentation } from "@/features/shared/query-database/presentation";
import type { QueryDefinition } from "@tau/shared/query-database";

const Panel = lazy(() =>
  import("@/features/shared/query-database/QueryDatabasePanel").then(module => ({
    default: module.QueryDatabasePanel,
  }))
);

/** 正文里的查询块：来源名作标题，视图栏工具常驻 */
export default function QueryDatabaseBlock({
  element,
  attributes,
  children,
}: ElementRenderProps<QueryDatabaseElement>) {
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const binding = useTextFieldBinding(element, "code");
  let params: QueryDefinition["params"];
  let presentation: QueryPresentation | undefined;
  try {
    params = element.paramsJson ? JSON.parse(element.paramsJson) : undefined;
    presentation = element.presentationJson ? JSON.parse(element.presentationJson) : undefined;
  } catch {
    return (
      <div {...attributes}>
        <div contentEditable={false} role="alert" className="text-danger text-tau-sm my-3">
          查询块配置无效，请检查参数和展示配置。
        </div>
        {children}
      </div>
    );
  }
  return (
    <div {...attributes}>
      <div contentEditable={false} className="relative py-[1.1em]">
        {binding.error && (
          <div role="alert" className="text-danger text-tau-sm">
            {binding.error}
          </div>
        )}
        <Suspense fallback={<div className="text-ink-3 text-tau-meta h-8">正在加载查询…</div>}>
          <Panel
            variant="block"
            initialSourceOpen={!element.code.trim()}
            definition={{
              version: 1,
              language: element.language ?? "dsl",
              code: binding.value,
              params,
            }}
            codeBinding={binding.binding}
            onDefinitionChange={
              !binding.readOnly && canEditElement(editor, element)
                ? definition => {
                    const snapshot = binding.binding?.getSnapshot();
                    if (snapshot && snapshot.value !== definition.code)
                      binding.binding?.replace(definition.code, snapshot.revision);
                    Transforms.setNodes(
                      editor,
                      {
                        language: definition.language,
                        paramsJson: JSON.stringify(definition.params ?? {}),
                      },
                      { at: ReactEditor.findPath(editor, element) }
                    );
                  }
                : undefined
            }
            presentation={presentation}
            onPresentationChange={
              !readOnly && canEditElement(editor, element)
                ? presentation =>
                    Transforms.setNodes(
                      editor,
                      { presentationJson: JSON.stringify(presentation) },
                      { at: ReactEditor.findPath(editor, element) }
                    )
                : undefined
            }
          />
        </Suspense>
      </div>
      {children}
      {!readOnly && <AddParagraph element={element} />}
    </div>
  );
}
