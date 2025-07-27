import { useState, memo, useEffect } from "react";
import { ReactEditor, useReadOnly, useSlate } from "slate-react";
import { Popover } from "antd";
import { Transforms } from "slate";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

import { EmojiElement } from "@editor/types";
import InlineChromiumBugfix from "@editor/components/InlineChromiumBugFix";
import { IExtensionBaseProps } from "../../../types";
import useTheme from "../../../../hooks/useTheme";

import styles from "./index.module.less";

const Emoji = memo((props: IExtensionBaseProps<EmojiElement>) => {
  const { attributes, element, children } = props;
  const { emoji, nativeEmoji, defaultOpen } = element;

  const editor = useSlate();
  const { isDark } = useTheme();
  const readonly = useReadOnly();

  const [pickerOpen, setPickerOpen] = useState(defaultOpen || false);

  const onEmojiSelect = (emojiData: any) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(
      editor,
      {
        emoji: emojiData.id,
        nativeEmoji: emojiData.native,
        shortcodes: emojiData.shortcodes,
      } as Partial<EmojiElement>,
      { at: path },
    );
    setPickerOpen(false);
  };

  const onOpenChange = (open: boolean) => {
    if (readonly) return;
    setPickerOpen(open);
  };

  useEffect(() => {
    if (defaultOpen) {
      const path = ReactEditor.findPath(editor, element);
      Transforms.setNodes(
        editor,
        {
          defaultOpen: false,
        },
        {
          at: path,
        },
      );
    }
  }, [defaultOpen]);

  return (
    <span
      {...attributes}
      contentEditable={false}
      className={styles.emojiContainer}
    >
      <InlineChromiumBugfix />
      <Popover
        trigger="click"
        open={!readonly && pickerOpen}
        onOpenChange={onOpenChange}
        content={
          <Picker
            data={data}
            theme={isDark ? "dark" : "light"}
            onEmojiSelect={onEmojiSelect}
            locale="zh"
            previewPosition="none"
            skinTonePosition="none"
            set="native"
          />
        }
        arrow={false}
        placement="bottom"
        styles={{
          body: {
            background: "transparent",
            boxShadow: "none",
          },
        }}
      >
        <span className={styles.emoji}>{nativeEmoji || emoji}</span>
      </Popover>
      {children}
      <InlineChromiumBugfix />
    </span>
  );
});

export default Emoji;
