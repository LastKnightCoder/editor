import { Descendant } from "slate";
import React, { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import classnames from "classnames";

import Outline from "@/components/Outline";
import If from "@/components/If";

import styles from './index.module.less';
import { HeaderElement } from "@editor/types";
import { getInlineElementText } from "@/utils";

interface EditorOutlineProps {
  className?: string;
  style?: React.CSSProperties;
  content: Descendant[];
  show: boolean;
  onClickHeader: (index: number) => void;
}

const EditorOutline = (props: EditorOutlineProps) => {
  const { className, style, content, show, onClickHeader } = props;

  const outlineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!outlineRef.current) return;
    if (show) {
      outlineRef.current.style.width = 'auto';
      outlineRef.current.style.overflow = 'visible';
      outlineRef.current.style.position = 'static';
    } else {
      const clientWidth = outlineRef.current.clientWidth;
      outlineRef.current.style.width = `${clientWidth}px`;
      outlineRef.current.style.overflow = 'hidden';
    }
  }, [show]);

  const headers = useMemo(() => {
    if (!content) return [];
    const headers =  content.filter(node => node.type === 'header') as HeaderElement[];
    return headers.map((header) => ({
      level: header.level,
      title: header.children.map(getInlineElementText).join(''),
    }));
  }, [content]);

  return (
    <If condition={headers.length > 0}>
      <motion.div
        layout
        layoutRoot
        className={classnames(styles.outline, {
          [styles.hide]: !show
        }, className)}
        style={style}
      >
        <div ref={outlineRef}>
          <Outline headers={headers} onClick={onClickHeader} />
        </div>
      </motion.div>
    </If>
  )
}

export default EditorOutline;
