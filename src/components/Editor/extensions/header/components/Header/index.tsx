import React from "react";
import { RenderElementProps } from "slate-react";
import styles from './index.module.less';
import {HeaderElement} from "@/components/Editor/types";

interface IHeaderProps {
  attributes: RenderElementProps['attributes'];
  element: HeaderElement;
}

const Header: React.FC<React.PropsWithChildren<IHeaderProps>> = (props) => {
  const { element, attributes, children } = props;
  const { level } = element;

  const renderHeader = () => {
    switch (level) {
      case 1:
        return <h1 {...attributes} className={styles.h1}>{children}</h1>;
      case 2:
        return <h2 {...attributes} className={styles.h2}>{children}</h2>;
      case 3:
        return <h3 {...attributes} className={styles.h3}>{children}</h3>;
      case 4:
        return <h4 {...attributes} className={styles.h4}>{children}</h4>;
      case 5:
        return <h5 {...attributes} className={styles.h5}>{children}</h5>;
      case 6:
        return <h6 {...attributes} className={styles.h6}>{children}</h6>;
    }
  }

  return renderHeader();
}

export default Header;