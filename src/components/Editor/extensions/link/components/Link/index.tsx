import React, { useState } from 'react';
import { Transforms } from "slate";
import { ReactEditor, RenderElementProps, useReadOnly, useSlate } from "slate-react";
import { Popover, Button, Input, App } from "antd";
import SVG from 'react-inlinesvg';
import classnames from 'classnames';

import unLinkIcon from '@/assets/icons/unlink.svg';
import copyIcon from '@/assets/icons/copy.svg';
import editIcon from '@/assets/icons/edit.svg';
import { openExternal as openUrl } from '@/commands';

import InlineChromiumBugfix from "@editor/components/InlineChromiumBugFix";
import { LinkElement } from "@editor/types";

import styles from './index.module.less';

interface LinkProps {
  attributes: RenderElementProps['attributes'];
  element: LinkElement
}

const EditLink: React.FC<{
  editable: boolean,
  url: string,
  onSubmit: (url: string) => void,
  onEditableChange: (editable: boolean) => void,
  unwrapLink: () => void
}> = (props) => {
  const { url, onSubmit, editable, onEditableChange, unwrapLink } = props;
  const [inputValue, setInputValue] = useState(url);
  const readOnly = useReadOnly();

  const { message } = App.useApp();

  const onCopyUrl = () => {
    navigator.clipboard.writeText(url).then(() => {
      message.success('已复制到剪切板');
    }).catch(() => {
      message.error('复制失败');
    })
  }

  if (!editable) {
    return (
      <div className={styles.unEditable}>
        <div className={styles.text}>{url}</div>
        <SVG className={styles.icon} src={copyIcon} onClick={onCopyUrl} />
        {
          !readOnly && (
            <>
              <SVG className={styles.icon} src={editIcon} onClick={() => { onEditableChange(true) }} />
              <SVG className={styles.icon} src={unLinkIcon} onClick={unwrapLink} />
            </>
          )
        }
      </div>
    )
  }

  return (
    <div className={styles.editContainer}>
      <div className={styles.inputArea}>
        <div className={styles.label}>链接地址：</div>
        <Input
          className={styles.input}
          value={inputValue}
          placeholder="请输入链接地址"
          onChange={(e) => { setInputValue(e.target.value) }}
        />
      </div>
      <div className={styles.btnGroups}>
        <Button onClick={() => { onEditableChange(false) }}>取消编辑</Button>
        <Button type="primary" onClick={() => { onSubmit(inputValue) }}>确定</Button>
      </div>
    </div>
  )
}

const Link: React.FC<React.PropsWithChildren<LinkProps>> = (props) => {
  const { attributes, children, element } = props;
  const { url, openEdit = false } = element;

  const editor = useSlate();
  const [open, setOpen] = useState(openEdit);
  const [editable, setEditable] = useState(openEdit);

  const unwrapLink = () => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.unwrapNodes(editor, { at: path });
  }

  const handleClick = () => {
    openUrl(url).then(() => {
      setOpen(false);
    });
  }

  const changeUrl = (url: string) => {
    setEditable(false);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { openEdit: false, url }, { at: path });
  }

  return (
    <Popover
      trigger={'hover'}
      open={open}
      mouseEnterDelay={0.3}
      mouseLeaveDelay={0.3}
      onOpenChange={(visible) => {
        setOpen(visible);
        setEditable(false);
      }}
      overlayInnerStyle={{
        padding: 0,
      }}
      content={(
        <EditLink
          url={url}
          onSubmit={changeUrl}
          editable={editable}
          onEditableChange={setEditable}
          unwrapLink={unwrapLink}
        />
      )}
      arrow={false}
      placement={'bottom'}
    >
      <span
        {...attributes}
        className={classnames(styles.link)}
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
