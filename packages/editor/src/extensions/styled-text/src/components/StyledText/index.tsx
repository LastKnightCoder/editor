import { useState, useEffect } from "react";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";
import { Popover } from "@tau/ui";
import { OverlayBackDismiss } from "@tau/editor/api";

import { StyledTextColorStyle, EStyledColor } from "../../colors.ts";
import { type StyledTextElement } from "../../types.ts";
import { InlineChromiumBugfix } from "@tau/editor/api";
import { ColorSelect } from "@tau/editor/extensions/text-formatting/panels";

import { useEditorTheme as useTheme } from "@tau/editor/api";
import { ElementRenderProps as IExtensionBaseProps } from "@tau/editor/api";

import { STYLED_TEXT_SELECT_COLOR_KEY } from "../../state";

const StyledText = (props: IExtensionBaseProps<StyledTextElement>) => {
  const { attributes, element, children } = props;

  const { color } = element;
  const editor = useSlateStatic();
  const { isDark } = useTheme();
  const readonly = useReadOnly();

  const { color: textColor, backgroundColor } =
    StyledTextColorStyle[isDark ? "dark" : "light"][color] || {};

  const [colorSelectOpen, setColorSelectOpen] = useState(false);
  useEffect(() => {
    if (readonly) setColorSelectOpen(false);
  }, [readonly]);

  const onSelectColor = (color: EStyledColor) => {
    if (readonly) return;
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { color }, { at: path });
    localStorage.setItem(STYLED_TEXT_SELECT_COLOR_KEY, color);
  };

  const onOpenChange = (open: boolean) => {
    if (readonly) return;
    setColorSelectOpen(open);
  };

  return (
    <Popover
      open={!readonly && colorSelectOpen}
      onOpenChange={onOpenChange}
      arrow={false}
      placement="bottom"
      // 调色面板自带外观，浮层只做定位
      className="min-w-0 max-w-none border-0 bg-transparent shadow-none"
      trigger={
        <span
          className="mx-[0.125em] rounded-[0.25em] p-[0.25em] font-bold"
          style={{
            color: textColor,
            backgroundColor,
          }}
          {...attributes}
        >
          <InlineChromiumBugfix />
          {children}
          <InlineChromiumBugfix />
        </span>
      }
    >
      <OverlayBackDismiss
        open={!readonly && colorSelectOpen}
        onDismiss={() => setColorSelectOpen(false)}
      />
      <ColorSelect<EStyledColor>
        colors={Object.values(StyledTextColorStyle[isDark ? "dark" : "light"]).map(item => ({
          ...item,
          color: item.backgroundColor,
        }))}
        onSelectColor={onSelectColor}
        selectColor={color}
      />
    </Popover>
  );
};

export default StyledText;
