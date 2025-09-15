import React, { PropsWithChildren, useEffect, useState } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";

import { TypstElement } from "@/components/Editor/types";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";
import styles from "./index.module.less";
import { compileTypst } from "@/commands/typst";
import { useDebounceFn } from "ahooks";
import useTheme from "@/components/Editor/hooks/useTheme.ts";

interface TypstProps {
  attributes: RenderElementProps["attributes"];
  element: TypstElement;
}

const TypstPreview: React.FC<{
  code: string;
  initHtml: string;
  onChangeHtml: (html: string) => void;
}> = ({ code, initHtml, onChangeHtml }) => {
  const [html, setHtml] = useState<string>(initHtml || "");
  const [error, setError] = useState<string>("");
  const { theme = "light" } = useTheme();

  const { run } = useDebounceFn(
    (c: string, i: Record<string, string> | undefined) => {
      compileTypst(c, i || {})
        .then((res: string) => {
          setHtml(res || "");
          onChangeHtml(res || "");
          setError("");
        })
        .catch((e: Error) => {
          const msg = e.message.replace(
            "Error invoking remote method 'compile-typst': Error: ",
            "",
          );
          setError(msg);
          setHtml("");
          onChangeHtml("");
        });
    },
    { wait: 200 },
  );

  useEffect(() => {
    run(code, { theme });
  }, [code, theme, run]);

  if (error) {
    return (
      <div contentEditable={false} className={styles.error}>
        {error}
      </div>
    );
  }

  if (!html) return null;
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

const Typst: React.FC<PropsWithChildren<TypstProps>> = (props) => {
  const { attributes, element, children } = props;
  const { content, html } = element;

  const editor = useSlate();

  const renderEmpty = () => {
    return (
      <div contentEditable={false} className={styles.empty}>
        点击编辑 Typst
      </div>
    );
  };

  const handleChange = (code: string) => {
    Transforms.setNodes(
      editor,
      { content: code },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  const handleChangeHtml = (html: string) => {
    Transforms.setNodes(
      editor,
      { html },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  return (
    <div {...attributes}>
      <PreviewWithEditor
        mode={"stex"}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        {content.trim() ? (
          <TypstPreview
            code={content}
            initHtml={html || ""}
            onChangeHtml={handleChangeHtml}
          />
        ) : (
          renderEmpty()
        )}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default Typst;
