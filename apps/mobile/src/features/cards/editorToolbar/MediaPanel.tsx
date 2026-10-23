import { type ReactNode, type SyntheticEvent } from "react";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import type { ImageAppearanceConfig } from "@tau/editor/extensions/media";

import { mobileImageAppearance } from "../../../services/editorRegistry";
import type { MediaEditingContext } from "./editingContext";
import {
  MEDIA_WIDTH_PRESETS,
  WEBVIEW_HEIGHTS,
  applyMediaWidthPreset,
  getImageAppearanceState,
  getMediaAlign,
  getMediaWidthPreset,
  getWebviewHeight,
  setImageAppearance,
  setMediaAlign,
  setWebviewHeight,
  type MediaAlign,
} from "./mediaActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";

type MediaPanelProps = {
  controller: MobileEditorToolbarController;
  context: MediaEditingContext;
};

const ICON_SIZE = 17;
const ICON_STROKE = 2.2;

const ALIGN_OPTIONS: Array<{ align: MediaAlign; label: string; icon: ReactNode }> = [
  {
    align: "left",
    label: "左对齐",
    icon: <AlignLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    align: "center",
    label: "居中",
    icon: <AlignCenter size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
  {
    align: "right",
    label: "右对齐",
    icon: <AlignRight size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  },
];

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/** 面板按钮按下不抢焦点（编辑器此时已失焦，避免触发聚焦弹键盘） */
function preventFocusSteal(event: SyntheticEvent) {
  event.preventDefault();
}

const pressHandlers = {
  onPointerDown: preventFocusSteal,
  onMouseDown: preventFocusSteal,
};

function GroupTitle(props: { children: ReactNode; hint?: string }) {
  return (
    <div className="text-ink-3 mb-[7px] flex justify-between text-[11.5px]">
      <span>{props.children}</span>
      {props.hint ? <span>{props.hint}</span> : null}
    </div>
  );
}

/** 档位卡片：缩略示意 + 文案，三张等分一行 */
function PresetCard(props: {
  label: string;
  active: boolean;
  onPress: () => void;
  children?: ReactNode;
}) {
  const { label, active, onPress, children } = props;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border-[1.5px] py-2 text-[11.5px] transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent-text"
          : "bg-page text-ink-2 border-transparent"
      )}
      {...pressHandlers}
      onClick={onPress}
    >
      {children}
      {label}
    </button>
  );
}

/** 宽度示意：两行文字中间夹一块按比例的图 */
function WidthGlyph(props: { ratio: number; active: boolean }) {
  return (
    <span className="bg-surface flex h-[30px] w-[54px] flex-col items-center gap-[3px] rounded px-[5px] py-1">
      <i className="bg-line-1 block h-[3px] w-full rounded-sm" />
      <b
        className={cn("block h-3 rounded-sm", props.active ? "bg-accent" : "bg-tag-1-soft")}
        style={{ width: `${props.ratio * 100}%` }}
      />
      <i className="bg-line-1 block h-[3px] w-full rounded-sm" />
    </span>
  );
}

function SegmentGroup(props: { children: ReactNode; disabled?: boolean }) {
  return (
    <div className={cn("bg-page mb-3 flex rounded-xl p-[3px]", props.disabled && "opacity-45")}>
      {props.children}
    </div>
  );
}

function SegmentButton(props: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { label, active, disabled = false, onPress, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "flex h-[38px] min-w-10 flex-1 items-center justify-center rounded-[9px] text-[13.5px] transition-colors",
        active ? "bg-surface text-accent-text shadow-lift" : "text-ink-1"
      )}
      {...pressHandlers}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

/** 媒体尺寸面板：图片 / 视频为宽度三档 + 对齐（图片另有外观），网页视图为高度三档 */
export function MediaPanel(props: MediaPanelProps) {
  const { controller, context } = props;

  if (context.mediaType === "webview") {
    const height = getWebviewHeight(context);
    return (
      <div className="px-3.5 pt-3" data-media-panel="webview">
        <GroupTitle>高度</GroupTitle>
        <div className="mb-3 flex gap-2">
          {WEBVIEW_HEIGHTS.map(option => (
            <PresetCard
              key={option.height}
              label={option.label}
              active={height === option.height}
              onPress={() =>
                controller.runMediaEdit(editor => setWebviewHeight(editor, context, option.height))
              }
            />
          ))}
        </div>
      </div>
    );
  }

  const preset = getMediaWidthPreset(context, controller.getEditableElement());
  const align = getMediaAlign(context);
  const fullWidth = preset === 1;
  const appearanceState =
    context.mediaType === "image"
      ? getImageAppearanceState(
          context,
          mobileImageAppearance.get() as ImageAppearanceConfig | undefined
        )
      : null;
  // 跟随设置时两项都不算单独开启，点任一项即显式开启
  const appearance = appearanceState && {
    ...appearanceState,
    rounded: !appearanceState.followsDefault && appearanceState.rounded,
    shadow: !appearanceState.followsDefault && appearanceState.shadow,
  };

  return (
    <div className="px-3.5 pt-3" data-media-panel={context.mediaType}>
      <GroupTitle>宽度</GroupTitle>
      <div className="mb-3 flex gap-2">
        {MEDIA_WIDTH_PRESETS.map(option => (
          <PresetCard
            key={option.ratio}
            label={option.label}
            active={preset === option.ratio}
            onPress={() =>
              controller.runMediaEdit(() => applyMediaWidthPreset(context, option.ratio))
            }
          >
            <WidthGlyph ratio={option.ratio} active={preset === option.ratio} />
          </PresetCard>
        ))}
      </div>
      <GroupTitle hint={fullWidth ? "满宽时不可用" : undefined}>对齐</GroupTitle>
      <SegmentGroup disabled={fullWidth}>
        {ALIGN_OPTIONS.map(option => (
          <SegmentButton
            key={option.align}
            label={option.label}
            active={align === option.align}
            disabled={fullWidth}
            onPress={() =>
              controller.runMediaEdit(editor => setMediaAlign(editor, context, option.align))
            }
          >
            {option.icon}
          </SegmentButton>
        ))}
      </SegmentGroup>
      {appearance ? (
        <>
          <GroupTitle>外观</GroupTitle>
          <SegmentGroup>
            <SegmentButton
              label="圆角"
              active={appearance.rounded}
              onPress={() =>
                controller.runMediaEdit(editor =>
                  setImageAppearance(editor, context, {
                    borderRadius: appearance.rounded ? "none" : "md",
                  })
                )
              }
            >
              圆角
            </SegmentButton>
            <SegmentButton
              label="阴影"
              active={appearance.shadow}
              onPress={() =>
                controller.runMediaEdit(editor =>
                  setImageAppearance(editor, context, { shadow: appearance.shadow ? "none" : "sm" })
                )
              }
            >
              阴影
            </SegmentButton>
            <SegmentButton
              label="跟随设置"
              active={appearance.followsDefault}
              onPress={() =>
                controller.runMediaEdit(editor => setImageAppearance(editor, context, "default"))
              }
            >
              跟随设置
            </SegmentButton>
          </SegmentGroup>
        </>
      ) : null}
    </div>
  );
}

export default MediaPanel;
