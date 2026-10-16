import { STICK_PADDING } from "../../constants/stickman";
import type { StickCategory, StickPerson, StickPose, StickProp, Vec } from "./types";

/** 标准站姿，x 为身体中线；o 为绝对坐标覆盖 */
const P = (x = 60, o: Partial<StickPerson> = {}): StickPerson => ({
  h: [x, 26],
  n: [x, 40],
  p: [x, 92],
  la: [
    [x - 13, 70],
    [x - 18, 92],
  ],
  ra: [
    [x + 13, 70],
    [x + 18, 92],
  ],
  ll: [
    [x - 7, 122],
    [x - 12, 152],
  ],
  rl: [
    [x + 7, 122],
    [x + 12, 152],
  ],
  ...o,
});

const line = (...pts: Vec[]): StickProp => ({ t: "line", pts });
const front = (prop: StickProp): StickProp => ({ ...prop, z: "front" }) as StickProp;

const chair = (x: number): StickProp[] => [
  line([x, 60], [x, 150]),
  line([x, 108], [x + 40, 108]),
  line([x + 36, 108], [x + 36, 150]),
];

const desk = (): StickProp[] => [
  line([82, 94], [156, 94]),
  line([148, 94], [148, 150]),
  front(line([96, 92], [128, 92])),
  front(line([128, 92], [138, 64])),
];

/** 拼图块：正方形，knob 为右侧凸起，否则为左侧凹口；凸起与凹口半径一致，可严丝合缝拼接 */
function puzzle(x: number, y: number, s: number, knob: boolean): Vec[] {
  const r = s * 0.2;
  const cy = y + s / 2;
  const arc = (cx: number, from: number, to: number) =>
    Array.from({ length: 11 }, (_, i): Vec => {
      const a = from + ((to - from) * i) / 10;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
  const right = knob ? arc(x + s, -Math.PI / 2, Math.PI / 2) : [];
  const left = knob ? [] : arc(x, Math.PI / 2, -Math.PI / 2);
  return [[x, y], [x + s, y], ...right, [x + s, y + s], [x, y + s], ...left];
}

export const STICK_CATEGORIES: { key: StickCategory; label: string }[] = [
  { key: "basic", label: "基础" },
  { key: "mood", label: "情绪" },
  { key: "work", label: "工作" },
  { key: "metaphor", label: "隐喻" },
  { key: "group", label: "多人" },
];

export const STICK_POSES: readonly StickPose[] = [
  // ───── 基础 ─────
  { key: "stand", name: "站立", cat: "basic", w: 120, h: 160, people: [P()] },
  {
    key: "wave",
    name: "挥手",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      P(60, {
        ra: [
          [80, 40],
          [88, 18],
        ],
      }),
    ],
    props: [line([96, 28], [102, 24]), line([96, 14], [100, 9])],
  },
  {
    key: "point",
    name: "指向",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      P(54, {
        ra: [
          [76, 46],
          [100, 40],
        ],
      }),
    ],
    props: [line([106, 39], [114, 37])],
  },
  {
    key: "walk",
    name: "走路",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      {
        h: [62, 26],
        n: [60, 40],
        p: [57, 92],
        la: [
          [48, 68],
          [42, 88],
        ],
        ra: [
          [70, 68],
          [82, 84],
        ],
        ll: [
          [48, 120],
          [38, 148],
        ],
        rl: [
          [66, 121],
          [72, 152],
        ],
      },
    ],
  },
  {
    key: "run",
    name: "奔跑",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      {
        h: [72, 28],
        n: [67, 42],
        p: [55, 90],
        la: [
          [50, 62],
          [38, 72],
        ],
        ra: [
          [80, 60],
          [92, 46],
        ],
        ll: [
          [42, 114],
          [24, 124],
        ],
        rl: [
          [76, 110],
          [72, 144],
        ],
      },
    ],
    props: [line([4, 52], [20, 52]), line([0, 66], [16, 66]), line([6, 80], [20, 80])],
  },
  {
    key: "sit",
    name: "坐下",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      {
        h: [48, 40],
        n: [48, 54],
        p: [48, 104],
        la: [
          [60, 82],
          [76, 100],
        ],
        ra: [
          [62, 84],
          [80, 102],
        ],
        ll: [
          [78, 102],
          [80, 150],
        ],
        rl: [
          [82, 106],
          [88, 150],
        ],
      },
    ],
    props: chair(30),
  },
  {
    key: "raise",
    name: "举手",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      P(60, {
        ra: [
          [72, 32],
          [76, 8],
        ],
      }),
    ],
  },
  {
    key: "jump",
    name: "跳跃",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      {
        h: [60, 16],
        n: [60, 30],
        p: [60, 82],
        la: [
          [44, 40],
          [30, 30],
        ],
        ra: [
          [76, 40],
          [90, 30],
        ],
        ll: [
          [48, 104],
          [52, 128],
        ],
        rl: [
          [72, 104],
          [68, 128],
        ],
      },
    ],
    props: [line([36, 154], [84, 154]), line([50, 138], [50, 146]), line([70, 138], [70, 146])],
  },
  {
    key: "crouch",
    name: "蹲下",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      {
        h: [60, 66],
        n: [56, 80],
        p: [50, 128],
        la: [
          [66, 98],
          [80, 108],
        ],
        ra: [
          [68, 100],
          [84, 114],
        ],
        ll: [
          [76, 112],
          [74, 150],
        ],
        rl: [
          [80, 118],
          [82, 150],
        ],
        bean: {
          h: [60, 66],
          n: [60, 80],
          p: [60, 122],
          la: [
            [42, 102],
            [38, 124],
          ],
          ra: [
            [78, 102],
            [82, 124],
          ],
          ll: [
            [36, 126],
            [42, 152],
          ],
          rl: [
            [84, 126],
            [78, 152],
          ],
        },
      },
    ],
  },

  // ───── 情绪 ─────
  {
    key: "think",
    name: "思考",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(54, {
        ra: [
          [74, 66],
          [61, 41],
        ],
        la: [
          [42, 72],
          [72, 68],
        ],
      }),
    ],
    props: [
      { t: "dot", c: [78, 34], r: 2 },
      { t: "dot", c: [85, 26], r: 2.8 },
      { t: "text", x: 98, y: 22, s: "?", size: 24 },
    ],
  },
  {
    key: "idea",
    name: "灵感",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(54, {
        ra: [
          [72, 38],
          [80, 24],
        ],
      }),
    ],
    props: [
      { t: "circle", c: [96, 22], r: 10, fill: "warn" },
      line([91, 35], [101, 35]),
      line([92, 39], [100, 39]),
      line([96, 7], [96, 2]),
      line([108, 12], [112, 8]),
      line([84, 12], [80, 8]),
      line([111, 24], [117, 24]),
    ],
  },
  {
    key: "cheer",
    name: "欢呼",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [46, 32],
          [38, 10],
        ],
        ra: [
          [74, 32],
          [82, 10],
        ],
        ll: [
          [50, 120],
          [40, 150],
        ],
        rl: [
          [70, 120],
          [80, 150],
        ],
      }),
    ],
    props: [
      line([22, 16], [16, 12]),
      line([24, 30], [17, 30]),
      line([98, 16], [104, 12]),
      line([96, 30], [103, 30]),
    ],
  },
  {
    key: "confused",
    name: "困惑",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [42, 64],
          [26, 56],
        ],
        ra: [
          [78, 64],
          [94, 56],
        ],
      }),
    ],
    props: [
      { t: "text", x: 24, y: 40, s: "?", size: 18 },
      { t: "text", x: 98, y: 34, s: "?", size: 24 },
    ],
  },
  {
    key: "sad",
    name: "沮丧",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(58, {
        h: [64, 34],
        n: [60, 46],
        la: [
          [50, 74],
          [48, 98],
        ],
        ra: [
          [68, 74],
          [70, 98],
        ],
      }),
    ],
    props: [line([50, 4], [50, 11]), line([64, 1], [64, 8]), line([78, 4], [78, 11])],
  },
  {
    key: "angry",
    name: "生气",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [38, 66],
          [52, 88],
        ],
        ra: [
          [82, 66],
          [68, 88],
        ],
      }),
    ],
    props: [
      line([82, 6], [88, 12], [83, 15], [90, 21]),
      line([38, 6], [32, 12], [37, 15], [30, 21]),
    ],
  },
  {
    key: "surprised",
    name: "惊讶",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [42, 52],
          [40, 30],
        ],
        ra: [
          [78, 52],
          [80, 30],
        ],
      }),
    ],
    props: [{ t: "text", x: 96, y: 14, s: "!", size: 24 }],
  },
  {
    key: "frantic",
    name: "抓狂",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [40, 42],
          [50, 16],
        ],
        ra: [
          [80, 42],
          [70, 16],
        ],
      }),
    ],
    props: [line([44, 3], [50, 7], [56, 2], [62, 7], [68, 2], [74, 7])],
  },
  {
    key: "like",
    name: "点赞",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(56, {
        ra: [
          [76, 62],
          [88, 48],
        ],
      }),
    ],
    props: [
      front({ t: "circle", c: [90, 45], r: 4.5, fill: "paper" }),
      front(line([90, 40], [90, 31])),
    ],
  },

  // ───── 工作 ─────
  {
    key: "present",
    name: "讲解",
    cat: "work",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [58, 40],
          [78, 32],
        ],
      }),
    ],
    props: [
      { t: "rect", x: 92, y: 4, w: 62, h: 72, fill: "paper" },
      line([100, 14], [100, 66], [148, 66]),
      line([104, 58], [116, 46], [127, 52], [144, 24]),
      line([110, 76], [104, 110]),
      line([136, 76], [142, 110]),
      front(line([78, 32], [112, 48])),
    ],
  },
  {
    key: "laptop",
    name: "办公",
    cat: "work",
    w: 160,
    h: 160,
    people: [
      {
        h: [54, 40],
        n: [54, 54],
        p: [54, 104],
        la: [
          [68, 82],
          [98, 88],
        ],
        ra: [
          [70, 86],
          [102, 90],
        ],
        ll: [
          [84, 104],
          [86, 150],
        ],
        rl: [
          [88, 108],
          [94, 150],
        ],
      },
    ],
    props: [...chair(36), ...desk()],
  },
  {
    key: "sign",
    name: "举牌",
    cat: "work",
    w: 124,
    h: 160,
    people: [
      P(54, {
        ra: [
          [72, 62],
          [93, 50],
        ],
      }),
    ],
    props: [
      line([94, 32], [94, 110]),
      { t: "rect", x: 68, y: 2, w: 52, h: 30, fill: 0 },
      line([76, 13], [112, 13]),
      line([76, 21], [102, 21]),
    ],
  },
  {
    key: "carry",
    name: "搬运",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(56, {
        la: [
          [66, 68],
          [82, 74],
        ],
        ra: [
          [70, 74],
          [86, 86],
        ],
        ll: [
          [50, 122],
          [46, 152],
        ],
        rl: [
          [64, 122],
          [70, 152],
        ],
      }),
    ],
    props: [
      front({ t: "rect", x: 76, y: 62, w: 36, h: 34, fill: 0 }),
      front(line([76, 72], [112, 72])),
    ],
  },
  {
    key: "flag",
    name: "达成",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(50, {
        ra: [
          [66, 40],
          [79, 30],
        ],
      }),
    ],
    props: [
      line([80, 6], [80, 152]),
      {
        t: "poly",
        pts: [
          [80, 6],
          [110, 14],
          [80, 24],
        ],
        fill: 0,
      },
    ],
  },
  {
    key: "write",
    name: "板书",
    cat: "work",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [62, 36],
          [90, 30],
        ],
      }),
    ],
    props: [
      { t: "rect", x: 92, y: 4, w: 62, h: 72, fill: "paper" },
      line([100, 18], [138, 18]),
      line([100, 30], [128, 30]),
      line([100, 44], [106, 40], [112, 46], [118, 40], [124, 46]),
      line([110, 76], [104, 110]),
      line([136, 76], [142, 110]),
    ],
  },
  {
    key: "phone",
    name: "通话",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(60, {
        ra: [
          [78, 58],
          [72, 30],
        ],
      }),
    ],
    props: [
      front({ t: "rect", x: 69, y: 16, w: 7, h: 18, fill: 0 }),
      line([84, 18], [88, 24], [84, 30]),
      line([91, 12], [97, 24], [91, 36]),
    ],
  },
  {
    key: "read",
    name: "阅读",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(58, {
        h: [62, 27],
        la: [
          [66, 72],
          [80, 66],
        ],
        ra: [
          [72, 76],
          [88, 68],
        ],
      }),
    ],
    props: [
      front({
        t: "poly",
        pts: [
          [74, 58],
          [86, 63],
          [98, 58],
          [98, 74],
          [86, 79],
          [74, 74],
        ],
        fill: "paper",
      }),
      front(line([86, 63], [86, 79])),
    ],
  },
  {
    key: "overtime",
    name: "加班",
    cat: "work",
    w: 160,
    h: 160,
    people: [
      {
        h: [60, 46],
        n: [55, 58],
        p: [54, 104],
        la: [
          [66, 86],
          [98, 88],
        ],
        ra: [
          [70, 90],
          [102, 90],
        ],
        ll: [
          [84, 104],
          [86, 150],
        ],
        rl: [
          [88, 108],
          [94, 150],
        ],
      },
    ],
    props: [
      ...chair(36),
      ...desk(),
      { t: "circle", c: [124, 24], r: 12, fill: "paper" },
      line([124, 24], [124, 16]),
      line([124, 24], [130, 28]),
      { t: "rect", x: 140, y: 81, w: 10, h: 13, fill: 1 },
      line([145, 76], [147, 69]),
      { t: "text", x: 80, y: 32, s: "z", size: 11 },
      { t: "text", x: 90, y: 22, s: "z", size: 15 },
    ],
  },
  {
    key: "podium",
    name: "演讲",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(66, {
        la: [
          [50, 62],
          [38, 46],
        ],
      }),
    ],
    props: [
      front({
        t: "poly",
        pts: [
          [44, 90],
          [92, 94],
          [84, 152],
          [54, 152],
        ],
        fill: 0,
      }),
      front(line([80, 92], [74, 70])),
      front({ t: "dot", c: [73, 66], r: 3.5 }),
    ],
  },
  {
    key: "sticky",
    name: "便签",
    cat: "work",
    w: 144,
    h: 160,
    people: [
      P(50, {
        ra: [
          [70, 40],
          [92, 30],
        ],
      }),
    ],
    props: [
      { t: "rect", x: 96, y: 8, w: 18, h: 18, fill: 0 },
      { t: "rect", x: 118, y: 8, w: 18, h: 18, fill: 1 },
      { t: "rect", x: 96, y: 30, w: 18, h: 18, fill: 2 },
      { t: "rect", x: 118, y: 30, w: 18, h: 18, fill: 3 },
      { t: "rect", x: 106, y: 52, w: 18, h: 18, fill: 4 },
    ],
  },

  // ───── 隐喻 ─────
  {
    key: "search",
    name: "探索",
    cat: "metaphor",
    w: 120,
    h: 160,
    people: [
      P(50, {
        h: [54, 28],
        ra: [
          [72, 64],
          [84, 52],
        ],
      }),
    ],
    props: [
      front(line([84, 54], [92, 44])),
      front({ t: "circle", c: [99, 36], r: 10, fill: "paper" }),
      front(line([94, 33], [97, 30])),
    ],
  },
  {
    key: "push",
    name: "攻坚",
    cat: "metaphor",
    w: 140,
    h: 160,
    people: [
      {
        h: [48, 46],
        n: [44, 58],
        p: [30, 102],
        la: [
          [58, 82],
          [74, 96],
        ],
        ra: [
          [60, 88],
          [72, 108],
        ],
        ll: [
          [22, 128],
          [8, 152],
        ],
        rl: [
          [40, 126],
          [30, 152],
        ],
      },
    ],
    props: [line([0, 153], [140, 153]), front({ t: "circle", c: [100, 118], r: 34, fill: 0 })],
  },
  {
    key: "ladder",
    name: "攀登",
    cat: "metaphor",
    w: 120,
    h: 160,
    people: [
      {
        h: [83, 40],
        n: [83, 54],
        p: [83, 100],
        la: [
          [68, 50],
          [70, 34],
        ],
        ra: [
          [100, 50],
          [96, 34],
        ],
        ll: [
          [74, 124],
          [72, 154],
        ],
        rl: [
          [94, 112],
          [96, 134],
        ],
        bean: {
          h: [83, 42],
          n: [83, 56],
          p: [83, 96],
          la: [
            [60, 52],
            [68, 34],
          ],
          ra: [
            [106, 52],
            [98, 34],
          ],
          ll: [
            [72, 122],
            [70, 154],
          ],
          rl: [
            [98, 114],
            [98, 134],
          ],
        },
      },
    ],
    props: [
      line([66, 2], [66, 158]),
      line([100, 2], [100, 158]),
      ...[14, 34, 54, 74, 94, 114, 134, 154].map(y => line([66, y], [100, y])),
    ],
  },
  {
    key: "stairs",
    name: "进阶",
    cat: "metaphor",
    w: 160,
    h: 180,
    people: [
      {
        h: [83, 16],
        n: [82, 30],
        p: [80, 82],
        la: [
          [70, 52],
          [64, 72],
        ],
        ra: [
          [92, 52],
          [100, 66],
        ],
        ll: [
          [72, 112],
          [68, 140],
        ],
        rl: [
          [94, 100],
          [96, 124],
        ],
      },
    ],
    props: [
      line(
        [0, 172],
        [28, 172],
        [28, 156],
        [56, 156],
        [56, 140],
        [84, 140],
        [84, 124],
        [112, 124],
        [112, 108],
        [150, 108]
      ),
      line([134, 108], [134, 72]),
      {
        t: "poly",
        pts: [
          [134, 72],
          [152, 78],
          [134, 84],
        ],
        fill: 0,
      },
    ],
  },
  {
    key: "lost",
    name: "迷路",
    cat: "metaphor",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [62, 40],
          [54, 18],
        ],
      }),
    ],
    props: [
      line([118, 24], [118, 152]),
      {
        t: "poly",
        pts: [
          [90, 30],
          [118, 30],
          [118, 46],
          [90, 46],
          [82, 38],
        ],
        fill: 0,
      },
      {
        t: "poly",
        pts: [
          [118, 54],
          [146, 54],
          [154, 62],
          [146, 70],
          [118, 70],
        ],
        fill: 1,
      },
      { t: "text", x: 72, y: 10, s: "?", size: 18 },
    ],
  },
  {
    key: "balance",
    name: "权衡",
    cat: "metaphor",
    w: 120,
    h: 160,
    people: [
      P(60, {
        h: [57, 27],
        la: [
          [40, 58],
          [18, 56],
        ],
        ra: [
          [80, 58],
          [102, 60],
        ],
      }),
    ],
    props: [
      { t: "rect", x: 8, y: 38, w: 20, h: 18, fill: 0 },
      { t: "circle", c: [103, 51], r: 9, fill: 1 },
    ],
  },
  {
    key: "puzzle",
    name: "拼合",
    cat: "metaphor",
    w: 160,
    h: 160,
    people: [
      P(36, {
        ra: [
          [50, 66],
          [60, 74],
        ],
      }),
      P(124, {
        la: [
          [110, 66],
          [100, 74],
        ],
      }),
    ],
    props: [
      front({ t: "poly", pts: puzzle(58, 56, 22, true), fill: 0 }),
      front({ t: "poly", pts: puzzle(80, 56, 22, false), fill: 1 }),
    ],
  },
  {
    key: "target",
    name: "命中",
    cat: "metaphor",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [56, 34],
          [62, 14],
        ],
      }),
    ],
    props: [
      line([112, 96], [104, 152]),
      line([136, 96], [144, 152]),
      { t: "circle", c: [124, 70], r: 30, fill: 0 },
      { t: "circle", c: [124, 70], r: 19, fill: "paper" },
      { t: "circle", c: [124, 70], r: 8, fill: 0 },
      front(line([92, 50], [124, 70])),
      front(line([92, 50], [84, 48])),
      front(line([92, 50], [90, 42])),
    ],
  },
  {
    key: "nurture",
    name: "培育",
    cat: "metaphor",
    w: 140,
    h: 160,
    people: [
      P(48, {
        ra: [
          [64, 64],
          [78, 70],
        ],
      }),
    ],
    props: [
      {
        t: "poly",
        pts: [
          [104, 134],
          [128, 134],
          [124, 152],
          [108, 152],
        ],
        fill: 0,
      },
      line([116, 134], [116, 106]),
      {
        t: "poly",
        pts: [
          [116, 122],
          [106, 116],
          [101, 106],
          [111, 109],
        ],
        fill: 2,
      },
      {
        t: "poly",
        pts: [
          [116, 114],
          [126, 108],
          [131, 98],
          [121, 101],
        ],
        fill: 2,
      },
      front({ t: "rect", x: 76, y: 64, w: 20, h: 16, fill: 1 }),
      front(line([80, 64], [86, 57], [92, 64])),
      front(line([96, 70], [108, 60])),
      { t: "dot", c: [111, 67], r: 1.6 },
      { t: "dot", c: [113, 75], r: 1.6 },
      { t: "dot", c: [110, 83], r: 1.6 },
    ],
  },

  // ───── 多人 ─────
  {
    key: "handshake",
    name: "握手",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(46, {
        ra: [
          [62, 66],
          [79, 70],
        ],
      }),
      P(114, {
        la: [
          [98, 66],
          [81, 70],
        ],
      }),
    ],
  },
  {
    key: "talk",
    name: "交谈",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [56, 68],
          [68, 60],
        ],
      }),
      P(120),
    ],
    props: [
      { t: "rect", x: 58, y: 0, w: 44, h: 24, fill: "paper" },
      line([66, 24], [59, 31], [74, 24]),
      { t: "dot", c: [70, 12], r: 1.8 },
      { t: "dot", c: [80, 12], r: 1.8 },
      { t: "dot", c: [90, 12], r: 1.8 },
    ],
  },
  {
    key: "team",
    name: "团队",
    cat: "group",
    w: 180,
    h: 160,
    people: [
      P(36, {
        ra: [
          [50, 70],
          [63, 88],
        ],
      }),
      P(90, {
        la: [
          [78, 70],
          [63, 88],
        ],
        ra: [
          [102, 70],
          [117, 88],
        ],
      }),
      P(144, {
        la: [
          [130, 70],
          [117, 88],
        ],
      }),
    ],
  },
  {
    key: "highfive",
    name: "击掌",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [60, 32],
          [78, 14],
        ],
      }),
      P(116, {
        la: [
          [100, 32],
          [82, 14],
        ],
      }),
    ],
    props: [line([80, 4], [80, -2]), line([70, 6], [66, 1]), line([90, 6], [94, 1])],
  },
  {
    key: "qa",
    name: "答疑",
    cat: "group",
    w: 200,
    h: 160,
    people: [
      P(36),
      P(84, {
        ra: [
          [96, 32],
          [100, 10],
        ],
      }),
      P(160, {
        la: [
          [146, 62],
          [128, 54],
        ],
      }),
    ],
    props: [{ t: "text", x: 114, y: 8, s: "?", size: 16 }],
  },
  {
    key: "handover",
    name: "交付",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [60, 68],
          [72, 74],
        ],
      }),
      P(116, {
        la: [
          [100, 68],
          [88, 74],
        ],
      }),
    ],
    props: [
      front({ t: "rect", x: 66, y: 58, w: 28, h: 26, fill: 0 }),
      front(line([66, 66], [94, 66])),
    ],
  },
  {
    key: "argue",
    name: "分歧",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [62, 50],
          [74, 42],
        ],
      }),
      P(116, {
        la: [
          [98, 50],
          [86, 42],
        ],
      }),
    ],
    props: [line([82, 2], [76, 14], [85, 16], [78, 30])],
  },
  {
    key: "meeting",
    name: "开会",
    cat: "group",
    w: 200,
    h: 160,
    people: [
      P(50),
      P(100, {
        ra: [
          [114, 36],
          [120, 18],
        ],
      }),
      P(150),
    ],
    props: [front({ t: "rect", x: 14, y: 90, w: 172, h: 50, fill: "paper" })],
  },
];

const POSE_MAP = new Map(STICK_POSES.map(pose => [pose.key, pose]));

/** 按 key 取姿态；未知 key（更新版本写入的数据）返回 undefined */
export const getStickPose = (key: string) => POSE_MAP.get(key);

/** 姿态的自然尺寸（含四周留白），即 1:1 放到画布上的大小 */
export const stickNaturalSize = (pose: StickPose): [number, number] => [
  pose.w + STICK_PADDING * 2,
  pose.h + STICK_PADDING * 2,
];

export const stickViewBox = (pose: StickPose) => {
  const [w, h] = stickNaturalSize(pose);
  return `${-STICK_PADDING} ${-STICK_PADDING} ${w} ${h}`;
};
