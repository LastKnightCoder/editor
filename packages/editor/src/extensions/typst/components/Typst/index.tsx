import React, { PropsWithChildren, useEffect, useState } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";

import type { TypstElement } from "../../../types";
import PreviewWithEditor from "../../../../components/PreviewWithEditor";
import styles from "./index.module.less";
import { useDebounceFn } from "ahooks";
import useTheme from "../../../../hooks/useTheme";

interface TypstProps {
  attributes: RenderElementProps["attributes"];
  element: TypstElement;
}

const TypstPreview: React.FC<{
  code: string;
  cachedHtml?: string;
  compiledFrom?: string;
  onCompiled: (html: string, compiledFrom: string) => void;
}> = ({ code, cachedHtml = "", compiledFrom, onCompiled }) => {
  const hasLegacyCache = !compiledFrom && !!cachedHtml;
  const cacheMatches = compiledFrom === code && !!cachedHtml;
  const [html, setHtml] = useState<string>(
    cacheMatches || hasLegacyCache ? cachedHtml : "",
  );
  const [error, setError] = useState<string>("");
  const [compileUnavailable, setCompileUnavailable] = useState(false);
  const { theme = "light" } = useTheme();
  const editor = useSlateStatic();
  const compileTypst = editor.services?.compiler?.typst;

  const { run } = useDebounceFn(
    async (c: string) => {
      if (!compileTypst) {
        setCompileUnavailable(true);
        if (cachedHtml) {
          setHtml(cachedHtml);
          setError("");
        } else {
          setError("当前环境不支持 Typst 编译");
          setHtml("");
        }
        return;
      }
      try {
        const res = await compileTypst(c);
        const nextHtml = res || "";
        setHtml(nextHtml);
        onCompiled(nextHtml, c);
        setError("");
      } catch (e: any) {
        const rawMsg = e?.message || "";
        const msg =
          rawMsg
            .replace(
              "Error invoking remote method 'compile-typst': Error: ",
              "",
            )
            .trim() || "编译 Typst 失败";
        const unsupported =
          /不支持\s*Typst/.test(rawMsg) ||
          /blog\s*模式\s*不支持/i.test(rawMsg) ||
          /not\s*support/i.test(rawMsg);
        if (unsupported) {
          setCompileUnavailable(true);
          if (cachedHtml) {
            setHtml(cachedHtml);
            setError("");
            return;
          }
        }
        setError(msg);
        setHtml("");
      }
    },
    { wait: 200 },
  );

  useEffect(() => {
    setCompileUnavailable(false);
  }, [compileTypst]);

  useEffect(() => {
    if (!code.trim()) {
      setHtml("");
      setError("");
      return;
    }

    if (compileUnavailable) {
      if (cachedHtml) {
        setHtml(cachedHtml || "");
        setError("");
      } else {
        setError("当前环境不支持 Typst 编译");
        setHtml("");
      }
      return;
    }

    if (cacheMatches) {
      setHtml(cachedHtml || "");
      setError("");
      return;
    }

    if (hasLegacyCache && !compileTypst) {
      setHtml(cachedHtml || "");
      setError("");
      return;
    }

    setHtml("");
    setError("");
    run(code);
  }, [
    cachedHtml,
    cacheMatches,
    code,
    compileTypst,
    compileUnavailable,
    hasLegacyCache,
    run,
    theme,
  ]);

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
  const { content, html, compiledFrom } = element;

  const editor = useSlateStatic();

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
      {
        content: code,
        html: "",
        compiledFrom: undefined,
        compiledAt: undefined,
      },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  const handleChangeHtml = (compiledHtml: string, compiledCode: string) => {
    Transforms.setNodes(
      editor,
      {
        html: compiledHtml,
        compiledFrom: compiledCode,
        compiledAt: Date.now(),
      },
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
            cachedHtml={html || ""}
            compiledFrom={compiledFrom}
            onCompiled={handleChangeHtml}
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
