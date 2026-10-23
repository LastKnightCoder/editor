import { ElementRenderProps as IExtensionBaseProps } from "@tau/editor/api";
import { type AudioElement } from "../../../../types/index";

import { AddParagraph, useIsLastElement } from "@tau/editor/api";
import { LoadingOverlay, cn } from "@tau/ui";
import { If } from "@tau/shared";
import { useAttrInput } from "../../../../hooks/useAttrInput";
import { ReactEditor, useReadOnly, useSlateStatic } from "slate-react";
import { Transforms } from "slate";

import { useEditorSlots } from "../../../../services/hooks";
import { openLocalMediaPicker } from "../../../../utils/mediaInsert";
import { useMediaUploading } from "../../../../utils/mediaSubmission";
import { useTouchMediaSelection } from "../../../../hooks/useTouchMediaSelection";
import { MEDIA_SELECTED_OUTLINE_CLASS } from "../../../../utils/mediaFrameClasses";

const Audio = (props: IExtensionBaseProps<AudioElement>) => {
  const { attributes, element, children } = props;
  const editor = useSlateStatic();
  const readOnly = useReadOnly();
  const isLast = useIsLastElement(element);
  // 触屏下标题不常驻输入框（阅读滚动时易误触弹键盘），改名经宿主工具栏；点卡片即选中
  const { touch, selected, select } = useTouchMediaSelection(element);

  const { Audio: AudioSlot } = useEditorSlots();

  // 标题就地编辑（输入法组词期间不提交，避免打断中文输入）
  const titleInput = useAttrInput(element.title, next => {
    const path = ReactEditor.findPath(editor, element);
    Transforms.setNodes(editor, { title: next }, { at: path });
  });
  const titleSlot =
    !readOnly && !touch ? (
      <input
        {...titleInput}
        placeholder="音频标题…"
        className="text-tau-body -ml-1 w-full truncate rounded-[6px] border-none bg-transparent px-1 font-medium text-[var(--ed-text)] outline-none transition-colors placeholder:font-normal placeholder:text-[var(--ed-text-tertiary)] hover:bg-[var(--ed-bg-hover)] focus:bg-[var(--ed-bg-surface)] focus:shadow-[0_0_0_1px_var(--ed-border),var(--ed-focus-ring)]"
      />
    ) : undefined;

  const { src } = element;
  const uploading = useMediaUploading(editor, element);

  // 遗留空音频元素的最小占位（正常流程经 slash 菜单直接创建已填充的元素）
  const renderNoContent = () => {
    if (readOnly) return null;
    return (
      <div className="flex items-center justify-center gap-[0.5em] rounded-[0.75em] border border-dashed border-gray-300 p-[1.5em] text-[0.875em] text-gray-500 dark:border-zinc-700 dark:text-zinc-400">
        {uploading ? (
          <span>音频上传中...</span>
        ) : (
          <>
            <span>空音频，</span>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent p-0 font-semibold text-[var(--ed-text-inverse)] underline-offset-2 hover:underline"
              onClick={() => openLocalMediaPicker(editor, "audio", element)}
            >
              选择文件
            </button>
            <span>上传</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="relative" suppressContentEditableWarning contentEditable={"false"}>
      <div {...attributes}>
        <LoadingOverlay loading={!!uploading}>
          {src ? (
            <div
              className={cn("rounded-tau-md relative", selected && MEDIA_SELECTED_OUTLINE_CLASS)}
              onClickCapture={() => {
                if (touch && !readOnly) select();
              }}
            >
              <AudioSlot
                src={src}
                controls
                label={element.title}
                labelSlot={titleSlot}
                sourceText={element.isFromGenerate ? element.audioText : undefined}
              />
            </div>
          ) : (
            <If condition={!src}>{renderNoContent()}</If>
          )}
        </LoadingOverlay>
        {children}
        {!(readOnly && isLast) && <AddParagraph element={element} />}
      </div>
    </div>
  );
};

export default Audio;
