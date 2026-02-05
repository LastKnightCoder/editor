import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlateStatic, ReactEditor } from "slate-react";
import { TikZ } from "@tau/shared";

import type { TikzElement } from "../../../types";
import PreviewWithEditor from "../../../../components/PreviewWithEditor";

import styles from "./index.module.less";

interface TikzProps {
  attributes: RenderElementProps["attributes"];
  element: TikzElement;
}

const Tikz: React.FC<PropsWithChildren<TikzProps>> = (props) => {
  const { attributes, element, children } = props;
  const { content } = element;

  const editor = useSlateStatic();

  const renderEmpty = () => {
    return (
      <div
        contentEditable={false}
        style={{ userSelect: "none" }}
        className={styles.empty}
      >
        点击编辑Tikz
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

  return (
    <div {...attributes} className={styles.tikz}>
      <PreviewWithEditor
        mode={"stex"}
        initValue={content}
        onChange={handleChange}
        element={element}
        center
      >
        {content.trim() ? <TikZ content={content} /> : renderEmpty()}
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default Tikz;
