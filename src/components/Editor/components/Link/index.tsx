import React, { useCallback, useState } from 'react';
import { Popover, Button, Input, Space } from "antd";
import InlineChromiumBugfix from "../InlineChromiumBugFix";
import {ReactEditor, RenderElementProps, useSlate} from "slate-react";
import classnames from 'classnames';
import { usePressedKeyStore } from "../../stores";

import styles from './index.module.less';
import { LinkElement } from "../../types";
import {Transforms} from "slate";
import {isLeafNode} from "../../utils";

interface LinkProps {
  attributes: RenderElementProps['attributes'];
  element: LinkElement
}

const EditLink: React.FC<{ url:string, onSubmit: (url: string) => void }> = (props) => {
  const { url, onSubmit } = props;
  const [inputValue, setInputValue] = React.useState(url);
  return (
    <div>
      <Space>
        <Input value={inputValue} placeholder="请输入链接地址" onChange={(e) => { setInputValue(e.target.value) }} />
        <Button type="primary" onClick={() => { onSubmit(inputValue) }}>确定</Button>
      </Space>
    </div>
  )
}

const Link: React.FC<React.PropsWithChildren<LinkProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, openEdit = false } = element;

  const editor = useSlate();
  const [open, setOpen] = useState(openEdit);

  const { isModKey } = usePressedKeyStore(state => ({
    isModKey: state.isModKey,
  }));

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (isModKey) {
      window.open(url, '_blank');
      return;
    }
    setOpen(!open);
    if (!open) {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { openEdit: false }, { at: path });
    }
    e.preventDefault();
  }, [isModKey, url, open]);

  const changeUrl = (url: string) => {
    Transforms.setNodes(editor, { url }, {
      match: n => isLeafNode(n) && n.type === 'link',
    });
    setOpen(false);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { openEdit: false }, { at: path });
  }

  return (
    <Popover
      open={open}
      content={<EditLink url={url} onSubmit={changeUrl} />}
      arrow={false}
      title={'编辑链接'}
    >
      <a
        {...attributes}
        className={classnames(styles.link, {[styles.active]:  isModKey })}
        onClick={handleClick}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </a>
    </Popover>
  )
}

export default Link;
