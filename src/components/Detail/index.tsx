import React from "react";
import { Collapse } from 'antd';
import { RenderElementProps } from "slate-react";
import { DetailElement } from "../../custom-types";
const { Panel } = Collapse;

interface ICollapseElementProps {
  attributes: RenderElementProps['attributes'];
  element: DetailElement;
}

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = (props) => {
  const { attributes, children, element } = props;
  const { title } = element;

  return (
    <Collapse {...attributes}>
      <Panel header={<span contentEditable={false} style={{ userSelect: 'none' }} >{title}</span>} key="1">
        {children}
      </Panel>
    </Collapse>
  );
}

export default Detail;