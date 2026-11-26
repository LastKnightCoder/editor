import { mobileEditorTranslator, useMobileEditorI18n } from "./i18n";
import { useRef, useState, type ReactNode } from "react";
import { Copy, Ellipsis, Keyboard, Layers, SquarePen, Trash2 } from "lucide-react";

import { ActionSheet, type ActionSheetItem } from "../../../components/ActionSheet";
import { AccessoryButton, ContextChip, LabeledButton } from "./accessoryControls";
import type { SourceBlockEditingContext } from "./editingContext";
import { deleteBlock, placeCaretAfterBlock } from "./mediaActions";
import type { MobileEditorToolbarController } from "./useMobileEditorToolbarController";

const t = mobileEditorTranslator.t;

const ICON_SIZE = 18;
const ICON_STROKE = 2.1;
const MENU_ICON_SIZE = 18;

type UseSourceBlockAccessoryOptions = {
  controller: MobileEditorToolbarController;
  /** 面板未打开时的源码块上下文，否则为 null */
  context: SourceBlockEditingContext | null;
};

/**
 * 配件栏源码块模式：选中源码预览块（触屏下点选）时左端块名标签、中段「编辑」「复制」，
 * 右端「⋯」（块操作、删除）与「键盘」。块名、图标与动作都取块自己登记的，不认具体块类型。
 */
export function useSourceBlockAccessory({ controller, context }: UseSourceBlockAccessoryOptions) {
  useMobileEditorI18n();
  const [sheet, setSheet] = useState<SourceBlockEditingContext | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const openSheet = (target: SourceBlockEditingContext) => {
    // 下一拍再打开，避免本次点击落到 Sheet 遮罩上
    window.setTimeout(() => setSheet(target), 0);
  };
  const closeSheet = () => {
    setSheet(null);
    const pending = pendingRef.current;
    pendingRef.current = null;
    pending?.();
  };
  /** 动作面板退场后再执行，避免与退场中的面板抢返回仲裁 */
  const afterSheet = (fn: () => void) => () => {
    pendingRef.current = fn;
  };

  const buildMoreGroups = (target: SourceBlockEditingContext): ActionSheetItem[][] => [
    [
      {
        get label() {
          return t("source.actions");
        },
        get desc() {
          return t("source.description");
        },
        icon: <Layers size={MENU_ICON_SIZE} />,
        onClick: afterSheet(() => controller.requestBlockSelection(target.path[0])),
      },
      ...(target.actions.readOnly
        ? []
        : [
            {
              get label() {
                return t("media.delete", { type: target.actions.title });
              },
              icon: <Trash2 size={MENU_ICON_SIZE} />,
              danger: true,
              onClick: afterSheet(() =>
                controller.runMediaEdit(editor => deleteBlock(editor, target))
              ),
            },
          ]),
    ],
  ];

  let leftNode: ReactNode = null;
  let middleNodes: ReactNode[] = [];
  let rightNode: ReactNode = null;
  if (context) {
    const { actions } = context;
    const Icon = actions.icon;
    leftNode = (
      <ContextChip icon={<Icon size={14} strokeWidth={ICON_STROKE} />} label={actions.title} />
    );
    middleNodes = [
      ...(actions.readOnly
        ? []
        : [
            <LabeledButton
              key="edit"
              label={t("common.edit")}
              icon={<SquarePen size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
              onPress={actions.edit}
            />,
          ]),
      <LabeledButton
        key="copy"
        label={t("common.copy")}
        icon={<Copy size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
        onPress={actions.copySource}
      />,
    ];
    rightNode = (
      <>
        <AccessoryButton
          label={t("media.menu", { type: actions.title })}
          onPress={() => openSheet(context)}
        >
          <Ellipsis size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </AccessoryButton>
        <AccessoryButton
          label={t("common.keyboard")}
          onPress={() => controller.focusAfterVoid(editor => placeCaretAfterBlock(editor, context))}
        >
          <Keyboard size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </AccessoryButton>
      </>
    );
  }

  const sheets = (
    <ActionSheet
      open={sheet !== null}
      title={sheet?.actions.title}
      groups={sheet ? buildMoreGroups(sheet) : []}
      onClose={closeSheet}
    />
  );

  return { leftNode, middleNodes, rightNode, sheets, sheetOpen: sheet !== null };
}
