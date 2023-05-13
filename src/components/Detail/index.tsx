import React from "react";
import { Collapse } from 'antd';
import { RenderElementProps } from "slate-react";
import { DetailElement } from "../../custom-types";
import AddParagraph from "../AddParagraph";
const { Panel } = Collapse;

interface ICollapseElementProps {
  attributes: RenderElementProps['attributes'];
  element: DetailElement;
}

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = (props) => {
  const { attributes, children, element } = props;
  const { title } = element;

  return (
    <div>
      <Collapse {...attributes}>
        <Panel header={<span contentEditable={false} style={{ userSelect: 'none' }} >{title}</span>} key="1">
          {children}
        </Panel>
      </Collapse>
      <AddParagraph element={element} />
    </div>
  );
}

export default Detail;