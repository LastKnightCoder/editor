import { memo } from "react";
import { produce } from "immer";
import { FlipHorizontal2, Palette, PersonStanding, UserRound } from "lucide-react";
import type { StickmanElement } from "../../../plugins/StickmanPlugin";
import { DEFAULT_STICK_POSE, STICK_BODY_OPTIONS } from "../../../constants/stickman";
import { StickmanUtil } from "../../../utils/StickmanUtil";
import {
  STICK_POSES,
  getStickPose,
  stickNaturalSize,
  type StickBody,
} from "../../../utils/stickman";
import { AttrPopover, AttrToggle, OptionGrid } from "../../../chrome";
import PosePicker, { StickGlyph } from "../../Stickman/PosePicker";
import SketchPopover from "../SketchPopover";

interface StickmanSetterProps {
  element: StickmanElement;
  onChange: (element: StickmanElement) => void;
}

/** 换姿态：保持当前缩放比例，以底边中点为锚（人站的位置不动） */
function repose(draft: StickmanElement, key: string) {
  const next = getStickPose(key);
  if (!next) return;
  const prev = getStickPose(draft.pose);
  const scale = prev ? draft.width / stickNaturalSize(prev)[0] : 1;
  const [w, h] = stickNaturalSize(next);
  const centerX = draft.x + draft.width / 2;
  const bottom = draft.y + draft.height;
  draft.pose = key;
  draft.width = w * scale;
  draft.height = h * scale;
  draft.x = centerX - draft.width / 2;
  draft.y = bottom - draft.height;
}

const StickmanSetter = memo(({ element, onChange }: StickmanSetterProps) => {
  const { pose, body, tint, flip } = element;
  const set = (recipe: (draft: StickmanElement) => void) => onChange(produce(element, recipe));
  const standing = getStickPose(DEFAULT_STICK_POSE) ?? STICK_POSES[0];

  return (
    <>
      <AttrPopover label="姿态" icon={<PersonStanding strokeWidth={1.75} />} width={348}>
        <PosePicker value={pose} body={body} tint={tint} onPick={key => set(d => repose(d, key))} />
      </AttrPopover>
      <AttrPopover label="形体" icon={<UserRound strokeWidth={1.75} />} width={240}>
        <OptionGrid<StickBody>
          cols={3}
          tall
          options={STICK_BODY_OPTIONS.map(o => ({
            value: o.value,
            label: o.label,
            glyph: <StickGlyph pose={standing} body={o.value} tint={tint} size={30} />,
          }))}
          value={body}
          onChange={v => {
            set(d => void (d.body = v));
            StickmanUtil.rememberStyle({ body: v });
          }}
        />
      </AttrPopover>
      <AttrToggle
        label="着色"
        icon={<Palette strokeWidth={1.75} />}
        checked={tint === "color"}
        onChange={v => {
          const next = v ? "color" : "mono";
          set(d => void (d.tint = next));
          StickmanUtil.rememberStyle({ tint: next });
        }}
      />
      <AttrToggle
        label="水平翻转"
        icon={<FlipHorizontal2 strokeWidth={1.75} />}
        checked={!!flip}
        onChange={v =>
          set(d => {
            if (v) d.flip = true;
            else delete d.flip;
          })
        }
      />
      <SketchPopover target={element} onChange={onChange} />
    </>
  );
});

export default StickmanSetter;
