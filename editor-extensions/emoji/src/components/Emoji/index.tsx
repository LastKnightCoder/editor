import React, { useState, useEffect } from "react";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { Popover } from "@tau/ui";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

import type { EmojiElement } from "../../types";
import {
  InlineChromiumBugfix,
  useEditorTheme as useTheme,
  type ElementRenderProps,
} from "@tau/editor/api";

const Emoji = React.memo((props: ElementRenderProps<EmojiElement>) => {
  const { attributes, element, children } = props;
  const { emoji, nativeEmoji, defaultOpen } = element;

  const editor = useSlateStatic();
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
      { at: path }
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
        }
      );
    }
  }, [defaultOpen]);

  return (
    <span {...attributes} contentEditable={false} className="relative inline-block">
      <InlineChromiumBugfix />
      <Popover
        open={!readonly && pickerOpen}
        onOpenChange={onOpenChange}
        arrow={false}
        placement="bottom"
        // emoji-mart 自带面板外观，浮层只做定位
        className="max-w-none border-0 bg-transparent shadow-none"
        trigger={
          <span className='inline-block cursor-pointer select-none rounded-[3px] px-0.5 font-["Apple_Color_Emoji","Segoe_UI_Emoji","Noto_Color_Emoji",sans-serif] text-[1.2em] leading-none transition-colors duration-200 hover:bg-[var(--ed-bg-hover)]'>
            {nativeEmoji || emoji}
          </span>
        }
      >
        <Picker
          data={data}
          theme={isDark ? "dark" : "light"}
          onEmojiSelect={onEmojiSelect}
          locale="zh"
          previewPosition="none"
          skinTonePosition="none"
          set="native"
        />
      </Popover>
      {children}
      <InlineChromiumBugfix />
    </span>
  );
});

export default Emoji;
