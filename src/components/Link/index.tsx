import React, { useCallback } from 'react';
import { RenderLeafProps } from "slate-react";
import classnames from 'classnames';
import { usePressedKeyStore } from "../../stores";

import styles from './index.module.less';
import { LinkElement } from "../../custom-types";

interface LinkProps {
  attributes: RenderLeafProps['attributes'];
  leaf: LinkElement
}

const Link: React.FC<React.PropsWithChildren<LinkProps>> = (props) => {
  const { attributes, children, leaf } = props;
  const { url } = leaf;

  const { isModKey } = usePressedKeyStore(state => ({
    isModKey: state.isModKey,
  }));

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (isModKey) {
      window.open(url, '_blank');
      return;
    }
    e.preventDefault();
  }, [isModKey]);

  return (
    <a
      {...attributes}
      className={classnames(styles.link, {[styles.active]:  isModKey })}
      onClick={handleClick}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  )
}

export default Link;
