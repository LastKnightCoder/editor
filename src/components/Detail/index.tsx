import React from "react";
import CaretRightOutlined from '@ant-design/icons/CaretRightOutlined';
import { RenderElementProps } from "slate-react";
import { DetailElement } from "../../custom-types";
import AddParagraph from "../AddParagraph";
import classnames from 'classnames';
import styles from './index.module.less';

interface ICollapseElementProps {
  attributes: RenderElementProps['attributes'];
  element: DetailElement;
}

const Detail: React.FC<React.PropsWithChildren<ICollapseElementProps>> = (props) => {
  const { attributes, children, element } = props;

  const [showContent, setShowContent] = React.useState(false);

  const toggleShowContent = () => {
    setShowContent(!showContent);
  }

  const arrowClass = classnames(styles.arrow, {
    [styles.show]: showContent,
    [styles.hide]: !showContent
  });

  const contentClass = classnames(styles.content, {
    [styles.show]: showContent,
    [styles.hide]: !showContent
  });

  return (
    <div {...attributes}>
      <div className={styles.container}>
        <div className={styles.title} onClick={toggleShowContent} contentEditable={false} style={{ userSelect: 'none' }} >
          <div className={arrowClass}><CaretRightOutlined /></div>
          <div>DETAIL</div>
        </div>
        <div className={contentClass}>
          <div>
            {children}
          </div>
        </div>
      </div>
      <AddParagraph element={element} />
    </div>
  );
}

export default Detail;