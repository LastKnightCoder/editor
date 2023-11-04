import React, { useCallback, useState } from 'react';
import { Popover, Button, Input } from "antd";
import { open as openUrl } from '@tauri-apps/api/shell';
import InlineChromiumBugfix from "@/components/Editor/components/InlineChromiumBugFix";
import { ReactEditor, RenderElementProps, useReadOnly, useSlate } from "slate-react";
import classnames from 'classnames';
import { usePressedKeyStore } from "@/components/Editor/stores";

import styles from './index.module.less';
import { LinkElement } from "@/components/Editor/types";
import { Transforms } from "slate";

interface LinkProps {
  attributes: RenderElementProps['attributes'];
  element: LinkElement
}

const EditLink: React.FC<{ url: string, onSubmit: (url: string) => void }> = (props) => {
  const { url, onSubmit } = props;
  const [inputValue, setInputValue] = React.useState(url);
  return (
    <div className={styles.editContainer}>
      <Input
        className={styles.input}
        value={inputValue}
        placeholder="请输入链接地址"
        onChange={(e) => { setInputValue(e.target.value) }}
      />
      <Button type="primary" onClick={() => { onSubmit(inputValue) }}>确定</Button>
    </div>
  )
}

const Link: React.FC<React.PropsWithChildren<LinkProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, openEdit = false } = element;

  const editor = useSlate();
  const readOnly = useReadOnly();
  const [open, setOpen] = useState(openEdit);

  const { isModKey } = usePressedKeyStore(state => ({
    isModKey: state.isModKey,
  }));

  const handleClick = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (isModKey || readOnly) {
      openUrl(url).then();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setOpen(!open);
    if (!open) {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(editor, { openEdit: false }, { at: path });
    }
  }, [isModKey, readOnly, open, url, editor, element]);

  const changeUrl = (url: string) => {
    Transforms.setNodes(editor, { url }, {
      match: n => n.type === 'link',
    });
    setOpen(false);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { openEdit: false }, { at: path });
  }

  return (
    <Popover
      trigger={'click'}
      open={open}
      onOpenChange={(visible) => {
        if (!open) {
          return;
        }
        setOpen(visible);
      }}
      content={<EditLink url={url} onSubmit={changeUrl} />}
      arrow={false}
      title={'编辑链接'}
    >
      <span
        {...attributes}
        className={classnames(styles.link, { [styles.active]:  isModKey })}
        onClick={handleClick}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
      </span>
    </Popover>
  )
}

export default Link;
