import { v4 as uuid } from "uuid";
import type { ElementCreateSpec } from "../api";
import type { StickmanElement } from "../../plugins/StickmanPlugin";
import { DEFAULT_STICK_POSE } from "../../constants/stickman";
import { StickmanUtil } from "../../utils/StickmanUtil";
import { getStickPose, stickNaturalSize } from "../../utils/stickman";

const poseOf = (options: Readonly<Record<string, unknown>> | null) =>
  getStickPose(typeof options?.pose === "string" ? options.pose : DEFAULT_STICK_POSE);

/** 以 center 为中心按姿态自然尺寸放置；形体与着色沿用最近一次的选择 */
export function buildStickmanElement(
  center: { x: number; y: number },
  options: Readonly<Record<string, unknown>> | null
): StickmanElement | null {
  const pose = poseOf(options);
  if (!pose) return null;
  const [width, height] = stickNaturalSize(pose);
  return {
    id: uuid(),
    type: "stickman",
    pose: pose.key,
    ...StickmanUtil.getPrevStyle(),
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
  };
}

/** 人物：单击放置（尺寸随姿态，defaultSize 只用于定位点击中心） */
export const stickmanCreateSpec: ElementCreateSpec = {
  gesture: "click",
  defaultSize: [132, 172],
  after: "select",
  hint: options => [`点击放置「${poseOf(options)?.name ?? "人物"}」`],
  build: ctx =>
    buildStickmanElement(
      { x: ctx.rect.x + ctx.rect.width / 2, y: ctx.rect.y + ctx.rect.height / 2 },
      ctx.options
    ),
};
