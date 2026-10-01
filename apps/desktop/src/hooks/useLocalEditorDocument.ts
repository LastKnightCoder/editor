import { useEffect } from "react";
import { useCreation, useMemoizedFn } from "ahooks";
import type { Descendant } from "slate";
import { createLocalYjsDocument } from "@tau/editor-collab/local";

/** 纯内存草稿随会话身份重建；Activity 停驻只解绑，文档与历史随 React 状态保留和回收。 */
export function useLocalEditorDocument(
  sessionKey: string,
  onChange: (value: Descendant[]) => void
) {
  const session = useCreation(
    () =>
      createLocalYjsDocument(undefined, {
        preserveAttributes: node =>
          ["image", "inline-image", "code-block"].includes(node.type) ? ["uuid"] : [],
      }),
    [sessionKey]
  );
  const notify = useMemoizedFn(onChange);
  useEffect(
    () =>
      session.subscribe(source => {
        if (source === "user") notify(session.getContent());
      }),
    [session, notify]
  );
  return session;
}
