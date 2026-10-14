import { DEFAULT_STICK_BODY, DEFAULT_STICK_TINT } from "../constants/stickman";
import type { StickBody, StickTint } from "./stickman/types";

const LOCAL_STORAGE_KEY = "whiteboard-stickman";
const BODIES: StickBody[] = ["classic", "bean", "glyph"];
const TINTS: StickTint[] = ["mono", "color"];

const read = (key: string) => localStorage.getItem(`${LOCAL_STORAGE_KEY}-${key}`);

/** 记住最近一次使用的形体与着色，新建人物与工具栏图块沿用 */
export class StickmanUtil {
  static getPrevStyle(): { body: StickBody; tint: StickTint } {
    const body = BODIES.find(value => value === read("body")) ?? DEFAULT_STICK_BODY;
    const tint = TINTS.find(value => value === read("tint")) ?? DEFAULT_STICK_TINT;
    return { body, tint };
  }

  static rememberStyle(style: { body?: StickBody; tint?: StickTint }) {
    if (style.body) localStorage.setItem(`${LOCAL_STORAGE_KEY}-body`, style.body);
    if (style.tint) localStorage.setItem(`${LOCAL_STORAGE_KEY}-tint`, style.tint);
  }
}
