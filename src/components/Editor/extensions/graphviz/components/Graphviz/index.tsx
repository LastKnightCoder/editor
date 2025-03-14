import React, { PropsWithChildren } from "react";
import { RenderElementProps, useSlate, ReactEditor } from "slate-react";
import { type GraphvizElement } from "@/components/Editor/types";
import styles from "./index.module.less";
import PreviewWithEditor from "@/components/Editor/components/PreviewWithEditor";
import { Transforms } from "slate";
import { Graphviz } from "graphviz-react";
import If from "@/components/If";

interface GraphvizProps {
  attributes: RenderElementProps["attributes"];
  element: GraphvizElement;
}

const GraphvizElement: React.FC<PropsWithChildren<GraphvizProps>> = (props) => {
  const { attributes, element, children } = props;
  const { dot } = element;

  const editor = useSlate();

  const handleOnChange = (dot: string) => {
    Transforms.setNodes(
      editor,
      { dot },
      { at: ReactEditor.findPath(editor, element) },
    );
  };

  return (
    <div {...attributes} className={styles.graphvizContainer}>
      <PreviewWithEditor
        mode={"text/x-graphviz"}
        initValue={dot}
        element={element}
        onChange={handleOnChange}
        center
      >
        <If condition={!!dot}>
          <Graphviz dot={dot} options={{ fit: true }} />
        </If>
        <If condition={!dot}>
          <div contentEditable={false} className={styles.empty}>
            点击编辑图表
          </div>
        </If>
      </PreviewWithEditor>
      {children}
    </div>
  );
};

export default GraphvizElement;
