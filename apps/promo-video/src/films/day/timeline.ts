/**
 * 主片时间轴（秒）。所有场景、字幕、镜头都从这里取时刻；配乐定稿后按节拍整体微调这一处。
 */
import { sec } from "../../brand/motion";

export const T = {
  end: 90,
  prologue: { headline: 0.4, exit: 3.9, windowRise: 3.6 },
  today: { arrive: 6.6, rings: [7.4, 8.6, 9.8], leave: 11.4 },
  pdf: {
    arrive: 12.8,
    push: 14.0,
    drag: [14.4, 15.6],
    toolbar: 15.8,
    pickColor: 16.6,
    toolbarHide: 16.9,
    annotation: 17.1,
    pullToList: 18.0,
    convertHover: 18.4,
    convertClick: 19.2,
    leave: 19.6,
  },
  card: { arrive: 21.2, typingStart: 21.6, push: 22.4 },
  ai: {
    open: 32.2,
    draft: 34.0,
    send: 35.5,
    tools: [
      [35.9, 36.5],
      [36.6, 37.1],
      [37.2, 38.0],
    ],
    answer: [38.0, 40.0],
  },
  review: { arrive: 42.0, flip: 43.2, rate: 45.0 },
  overview: { pull: [45.8, 49.0], dark: 48.0, collapse: [51.6, 53.6] },
  stars: { start: 53.0, grow: [54.0, 58.0], today: [56.0, 57.6], labels: [57.0, 58.5], push: [60.5, 63.5], insight: [61.5, 63.0], toWindow: [68.5, 70.0] },
  map: { report: 70.6, insight: [71.6, 72.6], exit: [76.5, 77.6] },
  finale: { converge: [77.0, 79.6], bloom: 79.6, slogan: 80.8, tagline: 82.6, url: 83.6, fadeOut: [88.8, 90] },
  night: [
    [0, 0],
    [45.5, 0],
    [49.5, 0.5],
    [53.0, 1],
  ] as [number, number][],
} as const;

export const f = sec;
