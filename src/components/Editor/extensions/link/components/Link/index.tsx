import React, { useState, memo } from "react";
import { Transforms } from "slate";
import {
  ReactEditor,
  RenderElementProps,
  useReadOnly,
  useSlate,
} from "slate-react";
import { Popover, Button, Input, App, Tooltip } from "antd";
import SVG from "react-inlinesvg";

import unLinkIcon from "@/assets/icons/unlink.svg";
import copyIcon from "@/assets/icons/copy.svg";
import editIcon from "@/assets/icons/edit.svg";
import { TbExternalLink } from "react-icons/tb";
import { openExternal as openUrl } from "@/commands";

import InlineChromiumBugfix from "@editor/components/InlineChromiumBugFix";
import { LinkElement } from "@editor/types";

import styles from "./index.module.less";
import { useMemoizedFn } from "ahooks";

interface LinkProps {
  attributes: RenderElementProps["attributes"];
  element: LinkElement;
}

const EditLink: React.FC<{
  editable: boolean;
  url: string;
  onSubmit: (url: string) => void;
  onEditableChange: (editable: boolean) => void;
  unwrapLink: () => void;
}> = memo((props) => {
  const { url, onSubmit, editable, onEditableChange, unwrapLink } = props;
  const [inputValue, setInputValue] = useState(url);
  const readOnly = useReadOnly();

  const { message } = App.useApp();

  const onCopyUrl = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        message.success("已复制到剪切板");
      })
      .catch(() => {
        message.error("复制失败");
      });
  };

  if (!editable) {
    return (
      <div className={styles.unEditable}>
        <div className={styles.text}>{url}</div>
        <Tooltip title="复制链接">
          <SVG className={styles.icon} src={copyIcon} onClick={onCopyUrl} />
        </Tooltip>
        {!readOnly && (
          <>
            <Tooltip title="编辑链接">
              <SVG
                className={styles.icon}
                src={editIcon}
                onClick={() => {
                  onEditableChange(true);
                }}
              />
            </Tooltip>
            <Tooltip title="取消链接">
              <SVG
                className={styles.icon}
                src={unLinkIcon}
                onClick={unwrapLink}
              />
            </Tooltip>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={styles.editContainer}>
      <div className={styles.inputArea}>
        <div className={styles.label}>链接地址：</div>
        <Input
          className={styles.input}
          value={inputValue}
          placeholder="请输入链接地址"
          onChange={(e) => {
            setInputValue(e.target.value);
          }}
        />
      </div>
      <div className={styles.btnGroups}>
        <Button
          onClick={() => {
            onEditableChange(false);
          }}
        >
          取消编辑
        </Button>
        <Button
          type="primary"
          onClick={() => {
            onSubmit(inputValue);
          }}
        >
          确定
        </Button>
      </div>
    </div>
  );
});

const Link: React.FC<React.PropsWithChildren<LinkProps>> = memo((props) => {
  const { attributes, children, element } = props;
  const { url, openEdit = false } = element;

  const editor = useSlate();
  const [open, setOpen] = useState(openEdit);
  const [editable, setEditable] = useState(openEdit);

  const unwrapLink = useMemoizedFn(() => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.unwrapNodes(editor, { at: path });
  });

  const handleClick = useMemoizedFn(() => {
    openUrl(url).then(() => {
      setOpen(false);
    });
  });

  const changeUrl = useMemoizedFn((url: string) => {
    if (!url) {
      unwrapLink();
      return;
    }
    setEditable(false);
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { openEdit: false, url }, { at: path });
    setOpen(false);
  });

  const handleOpenChange = useMemoizedFn((visible: boolean) => {
    // 如果关闭的时候 url 为空，则 unwrapLink
    if (!visible && !url) {
      unwrapLink();
      return;
    }
    setOpen(visible);
    setEditable(false);
  });

  const handleClickATag = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <Popover
      trigger={"hover"}
      open={open}
      mouseEnterDelay={0.3}
      mouseLeaveDelay={0.3}
      onOpenChange={handleOpenChange}
      styles={{
        body: {
          padding: 0,
        },
      }}
      content={
        <EditLink
          url={url}
          onSubmit={changeUrl}
          editable={editable}
          onEditableChange={setEditable}
          unwrapLink={unwrapLink}
        />
      }
      arrow={false}
      placement={"bottom"}
    >
      <a
        {...attributes}
        href={url}
        className={styles.link}
        onClick={handleClickATag}
      >
        <InlineChromiumBugfix />
        {children}
        <InlineChromiumBugfix />
        <Tooltip title="打开链接">
          <span
            className={styles.icon}
            contentEditable={false}
            onClick={handleClick}
          >
            <TbExternalLink />
          </span>
        </Tooltip>
      </a>
    </Popover>
  );
});

export default Link;
