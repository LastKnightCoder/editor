import React, { PropsWithChildren } from "react";
import { Transforms } from "slate";
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";
import Mermaid from "../Mermaid";
import { defaultMermaidConfig } from "./config";

import { MermaidElement } from "@/components/Editor/types";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";

import styles from "./index.module.less";
import mermaid from "mermaid";

interface MermaidProps {
  attributes: RenderElementProps["attributes"];
  element: MermaidElement;
}

mermaid.initialize(defaultMermaidConfig);

const MermaidChart: React.FC<PropsWithChildren<MermaidProps>> = (props) => {
  const { attributes, element, children } = props;
  const { chart } = element;
  const editor = useSlate();

  const renderEmpty = () => {
    return (
      <div contentEditable={false} className={styles.empty}>
        点击编辑图表
      </div>
    );
  };

  const onChange = (value: string) => {
    Transforms.setNodes(
      editor,
      { chart: value },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  return (
    <div {...attributes} className={styles.mermaid}>
      <div contentEditable={false}>
        <PreviewWithEditor
          mode={"mermaid"}
          initValue={chart}
          onChange={onChange}
          element={element}
          center
        >
          {chart ? <Mermaid chart={chart} /> : renderEmpty()}
        </PreviewWithEditor>
      </div>
      {children}
    </div>
  );
};

export default MermaidChart;
