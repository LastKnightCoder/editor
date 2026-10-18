"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.tsx
var index_exports = {};
__export(index_exports, {
  default: () => index_default,
  extension: () => extension
});
module.exports = __toCommonJS(index_exports);

// <define:__PLUGIN_META__>
var define_PLUGIN_META_default = { id: "taunote.stickman", name: "\u706B\u67F4\u4EBA", version: "0.1.1" };

// src/index.tsx
var import_plugins = require("@tau/plugins");
var import_whiteboard8 = require("@tau/plugins/whiteboard");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/createLucideIcon.js
var import_react2 = require("react");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && array.indexOf(className) === index;
}).join(" ");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/Icon.js
var import_react = require("react");

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/Icon.js
var Icon = (0, import_react.forwardRef)(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return (0, import_react.createElement)(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => (0, import_react.createElement)(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = (0, import_react2.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react2.createElement)(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/icons/flip-horizontal-2.js
var FlipHorizontal2 = createLucideIcon("FlipHorizontal2", [
  ["path", { d: "m3 7 5 5-5 5V7", key: "couhi7" }],
  ["path", { d: "m21 7-5 5 5 5V7", key: "6ouia7" }],
  ["path", { d: "M12 20v2", key: "1lh1kg" }],
  ["path", { d: "M12 14v2", key: "8jcxud" }],
  ["path", { d: "M12 8v2", key: "1woqiv" }],
  ["path", { d: "M12 2v2", key: "tus03m" }]
]);

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/icons/palette.js
var Palette = createLucideIcon("Palette", [
  ["circle", { cx: "13.5", cy: "6.5", r: ".5", fill: "currentColor", key: "1okk4w" }],
  ["circle", { cx: "17.5", cy: "10.5", r: ".5", fill: "currentColor", key: "f64h9f" }],
  ["circle", { cx: "8.5", cy: "7.5", r: ".5", fill: "currentColor", key: "fotxhn" }],
  ["circle", { cx: "6.5", cy: "12.5", r: ".5", fill: "currentColor", key: "qy21gx" }],
  [
    "path",
    {
      d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z",
      key: "12rzf8"
    }
  ]
]);

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/icons/person-standing.js
var PersonStanding = createLucideIcon("PersonStanding", [
  ["circle", { cx: "12", cy: "5", r: "1", key: "gxeob9" }],
  ["path", { d: "m9 20 3-6 3 6", key: "se2kox" }],
  ["path", { d: "m6 8 6 2 6-2", key: "4o3us4" }],
  ["path", { d: "M12 10v4", key: "1kjpxc" }]
]);

// node_modules/.pnpm/lucide-react@0.399.0_react@19.2.0/node_modules/lucide-react/dist/esm/icons/user-round.js
var UserRound = createLucideIcon("UserRound", [
  ["circle", { cx: "12", cy: "8", r: "5", key: "1hypcn" }],
  ["path", { d: "M20 21a8 8 0 0 0-16 0", key: "rfgkzh" }]
]);

// src/constants.ts
var STICK_INK = "var(--tau-ink-1)";
var STICK_PAPER = "var(--tau-bg-surface)";
var STICK_MONO_FILL = "color-mix(in srgb, var(--tau-ink-1) 9%, var(--tau-bg-surface))";
var STICK_WARN_FILL = "color-mix(in srgb, var(--tau-warn) 42%, var(--tau-bg-surface))";
var STICK_TINTS = ["accent", "tag-2", "tag-1", "tag-3", "tag-4"].map(
  (token) => `color-mix(in srgb, var(--tau-${token}) 32%, var(--tau-bg-surface))`
);
var STICK_BODY_OPTIONS = [
  { value: "classic", label: "\u7ECF\u5178" },
  { value: "bean", label: "\u8C46\u8C46" },
  { value: "glyph", label: "\u8C61\u5F62" }
];
var DEFAULT_STICK_POSE = "stand";
var DEFAULT_STICK_BODY = "classic";
var DEFAULT_STICK_TINT = "color";
var STICK_PADDING = 6;

// src/model/poses.ts
var P = (x = 60, o = {}) => ({
  h: [x, 26],
  n: [x, 40],
  p: [x, 92],
  la: [
    [x - 13, 70],
    [x - 18, 92]
  ],
  ra: [
    [x + 13, 70],
    [x + 18, 92]
  ],
  ll: [
    [x - 7, 122],
    [x - 12, 152]
  ],
  rl: [
    [x + 7, 122],
    [x + 12, 152]
  ],
  ...o
});
var line = (...pts) => ({ t: "line", pts });
var front = (prop) => ({ ...prop, z: "front" });
var chair = (x) => [
  line([x, 60], [x, 150]),
  line([x, 108], [x + 40, 108]),
  line([x + 36, 108], [x + 36, 150])
];
var desk = () => [
  line([82, 94], [156, 94]),
  line([148, 94], [148, 150]),
  front(line([96, 92], [128, 92])),
  front(line([128, 92], [138, 64]))
];
function puzzle(x, y, s, knob) {
  const r = s * 0.2;
  const cy = y + s / 2;
  const arc = (cx, from, to) => Array.from({ length: 11 }, (_, i) => {
    const a = from + (to - from) * i / 10;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  const right = knob ? arc(x + s, -Math.PI / 2, Math.PI / 2) : [];
  const left = knob ? [] : arc(x, Math.PI / 2, -Math.PI / 2);
  return [[x, y], [x + s, y], ...right, [x + s, y + s], [x, y + s], ...left];
}
var STICK_CATEGORIES = [
  { key: "basic", label: "\u57FA\u7840" },
  { key: "mood", label: "\u60C5\u7EEA" },
  { key: "work", label: "\u5DE5\u4F5C" },
  { key: "metaphor", label: "\u9690\u55BB" },
  { key: "group", label: "\u591A\u4EBA" }
];
var STICK_POSES = [
  // ───── 基础 ─────
  { key: "stand", name: "\u7AD9\u7ACB", cat: "basic", w: 120, h: 160, people: [P()] },
  {
    key: "wave",
    name: "\u6325\u624B",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      P(60, {
        ra: [
          [80, 40],
          [88, 18]
        ]
      })
    ],
    props: [line([96, 28], [102, 24]), line([96, 14], [100, 9])]
  },
  {
    key: "point",
    name: "\u6307\u5411",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      P(54, {
        ra: [
          [76, 46],
          [100, 40]
        ]
      })
    ],
    props: [line([106, 39], [114, 37])]
  },
  {
    key: "walk",
    name: "\u8D70\u8DEF",
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
          [42, 88]
        ],
        ra: [
          [70, 68],
          [82, 84]
        ],
        ll: [
          [48, 120],
          [38, 148]
        ],
        rl: [
          [66, 121],
          [72, 152]
        ]
      }
    ]
  },
  {
    key: "run",
    name: "\u5954\u8DD1",
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
          [38, 72]
        ],
        ra: [
          [80, 60],
          [92, 46]
        ],
        ll: [
          [42, 114],
          [24, 124]
        ],
        rl: [
          [76, 110],
          [72, 144]
        ]
      }
    ],
    props: [
      line([4, 52], [20, 52]),
      line([0, 66], [16, 66]),
      line([6, 80], [20, 80])
    ]
  },
  {
    key: "sit",
    name: "\u5750\u4E0B",
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
          [76, 100]
        ],
        ra: [
          [62, 84],
          [80, 102]
        ],
        ll: [
          [78, 102],
          [80, 150]
        ],
        rl: [
          [82, 106],
          [88, 150]
        ]
      }
    ],
    props: chair(30)
  },
  {
    key: "raise",
    name: "\u4E3E\u624B",
    cat: "basic",
    w: 120,
    h: 160,
    people: [
      P(60, {
        ra: [
          [72, 32],
          [76, 8]
        ]
      })
    ]
  },
  {
    key: "jump",
    name: "\u8DF3\u8DC3",
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
          [30, 30]
        ],
        ra: [
          [76, 40],
          [90, 30]
        ],
        ll: [
          [48, 104],
          [52, 128]
        ],
        rl: [
          [72, 104],
          [68, 128]
        ]
      }
    ],
    props: [
      line([36, 154], [84, 154]),
      line([50, 138], [50, 146]),
      line([70, 138], [70, 146])
    ]
  },
  {
    key: "crouch",
    name: "\u8E72\u4E0B",
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
          [80, 108]
        ],
        ra: [
          [68, 100],
          [84, 114]
        ],
        ll: [
          [76, 112],
          [74, 150]
        ],
        rl: [
          [80, 118],
          [82, 150]
        ],
        bean: {
          h: [60, 66],
          n: [60, 80],
          p: [60, 122],
          la: [
            [42, 102],
            [38, 124]
          ],
          ra: [
            [78, 102],
            [82, 124]
          ],
          ll: [
            [36, 126],
            [42, 152]
          ],
          rl: [
            [84, 126],
            [78, 152]
          ]
        }
      }
    ]
  },
  // ───── 情绪 ─────
  {
    key: "think",
    name: "\u601D\u8003",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(54, {
        ra: [
          [74, 66],
          [61, 41]
        ],
        la: [
          [42, 72],
          [72, 68]
        ]
      })
    ],
    props: [
      { t: "dot", c: [78, 34], r: 2 },
      { t: "dot", c: [85, 26], r: 2.8 },
      { t: "text", x: 98, y: 22, s: "?", size: 24 }
    ]
  },
  {
    key: "idea",
    name: "\u7075\u611F",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(54, {
        ra: [
          [72, 38],
          [80, 24]
        ]
      })
    ],
    props: [
      { t: "circle", c: [96, 22], r: 10, fill: "warn" },
      line([91, 35], [101, 35]),
      line([92, 39], [100, 39]),
      line([96, 7], [96, 2]),
      line([108, 12], [112, 8]),
      line([84, 12], [80, 8]),
      line([111, 24], [117, 24])
    ]
  },
  {
    key: "cheer",
    name: "\u6B22\u547C",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [46, 32],
          [38, 10]
        ],
        ra: [
          [74, 32],
          [82, 10]
        ],
        ll: [
          [50, 120],
          [40, 150]
        ],
        rl: [
          [70, 120],
          [80, 150]
        ]
      })
    ],
    props: [
      line([22, 16], [16, 12]),
      line([24, 30], [17, 30]),
      line([98, 16], [104, 12]),
      line([96, 30], [103, 30])
    ]
  },
  {
    key: "confused",
    name: "\u56F0\u60D1",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [42, 64],
          [26, 56]
        ],
        ra: [
          [78, 64],
          [94, 56]
        ]
      })
    ],
    props: [
      { t: "text", x: 24, y: 40, s: "?", size: 18 },
      { t: "text", x: 98, y: 34, s: "?", size: 24 }
    ]
  },
  {
    key: "sad",
    name: "\u6CAE\u4E27",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(58, {
        h: [64, 34],
        n: [60, 46],
        la: [
          [50, 74],
          [48, 98]
        ],
        ra: [
          [68, 74],
          [70, 98]
        ]
      })
    ],
    props: [
      line([50, 4], [50, 11]),
      line([64, 1], [64, 8]),
      line([78, 4], [78, 11])
    ]
  },
  {
    key: "angry",
    name: "\u751F\u6C14",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [38, 66],
          [52, 88]
        ],
        ra: [
          [82, 66],
          [68, 88]
        ]
      })
    ],
    props: [
      line([82, 6], [88, 12], [83, 15], [90, 21]),
      line([38, 6], [32, 12], [37, 15], [30, 21])
    ]
  },
  {
    key: "surprised",
    name: "\u60CA\u8BB6",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [42, 52],
          [40, 30]
        ],
        ra: [
          [78, 52],
          [80, 30]
        ]
      })
    ],
    props: [{ t: "text", x: 96, y: 14, s: "!", size: 24 }]
  },
  {
    key: "frantic",
    name: "\u6293\u72C2",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(60, {
        la: [
          [40, 42],
          [50, 16]
        ],
        ra: [
          [80, 42],
          [70, 16]
        ]
      })
    ],
    props: [line([44, 3], [50, 7], [56, 2], [62, 7], [68, 2], [74, 7])]
  },
  {
    key: "like",
    name: "\u70B9\u8D5E",
    cat: "mood",
    w: 120,
    h: 160,
    people: [
      P(56, {
        ra: [
          [76, 62],
          [88, 48]
        ]
      })
    ],
    props: [
      front({ t: "circle", c: [90, 45], r: 4.5, fill: "paper" }),
      front(line([90, 40], [90, 31]))
    ]
  },
  // ───── 工作 ─────
  {
    key: "present",
    name: "\u8BB2\u89E3",
    cat: "work",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [58, 40],
          [78, 32]
        ]
      })
    ],
    props: [
      { t: "rect", x: 92, y: 4, w: 62, h: 72, fill: "paper" },
      line([100, 14], [100, 66], [148, 66]),
      line([104, 58], [116, 46], [127, 52], [144, 24]),
      line([110, 76], [104, 110]),
      line([136, 76], [142, 110]),
      front(line([78, 32], [112, 48]))
    ]
  },
  {
    key: "laptop",
    name: "\u529E\u516C",
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
          [98, 88]
        ],
        ra: [
          [70, 86],
          [102, 90]
        ],
        ll: [
          [84, 104],
          [86, 150]
        ],
        rl: [
          [88, 108],
          [94, 150]
        ]
      }
    ],
    props: [...chair(36), ...desk()]
  },
  {
    key: "sign",
    name: "\u4E3E\u724C",
    cat: "work",
    w: 124,
    h: 160,
    people: [
      P(54, {
        ra: [
          [72, 62],
          [93, 50]
        ]
      })
    ],
    props: [
      line([94, 32], [94, 110]),
      { t: "rect", x: 68, y: 2, w: 52, h: 30, fill: 0 },
      line([76, 13], [112, 13]),
      line([76, 21], [102, 21])
    ]
  },
  {
    key: "carry",
    name: "\u642C\u8FD0",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(56, {
        la: [
          [66, 68],
          [82, 74]
        ],
        ra: [
          [70, 74],
          [86, 86]
        ],
        ll: [
          [50, 122],
          [46, 152]
        ],
        rl: [
          [64, 122],
          [70, 152]
        ]
      })
    ],
    props: [
      front({ t: "rect", x: 76, y: 62, w: 36, h: 34, fill: 0 }),
      front(line([76, 72], [112, 72]))
    ]
  },
  {
    key: "flag",
    name: "\u8FBE\u6210",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(50, {
        ra: [
          [66, 40],
          [79, 30]
        ]
      })
    ],
    props: [
      line([80, 6], [80, 152]),
      {
        t: "poly",
        pts: [
          [80, 6],
          [110, 14],
          [80, 24]
        ],
        fill: 0
      }
    ]
  },
  {
    key: "write",
    name: "\u677F\u4E66",
    cat: "work",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [62, 36],
          [90, 30]
        ]
      })
    ],
    props: [
      { t: "rect", x: 92, y: 4, w: 62, h: 72, fill: "paper" },
      line([100, 18], [138, 18]),
      line([100, 30], [128, 30]),
      line([100, 44], [106, 40], [112, 46], [118, 40], [124, 46]),
      line([110, 76], [104, 110]),
      line([136, 76], [142, 110])
    ]
  },
  {
    key: "phone",
    name: "\u901A\u8BDD",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(60, {
        ra: [
          [78, 58],
          [72, 30]
        ]
      })
    ],
    props: [
      front({ t: "rect", x: 69, y: 16, w: 7, h: 18, fill: 0 }),
      line([84, 18], [88, 24], [84, 30]),
      line([91, 12], [97, 24], [91, 36])
    ]
  },
  {
    key: "read",
    name: "\u9605\u8BFB",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(58, {
        h: [62, 27],
        la: [
          [66, 72],
          [80, 66]
        ],
        ra: [
          [72, 76],
          [88, 68]
        ]
      })
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
          [74, 74]
        ],
        fill: "paper"
      }),
      front(line([86, 63], [86, 79]))
    ]
  },
  {
    key: "overtime",
    name: "\u52A0\u73ED",
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
          [98, 88]
        ],
        ra: [
          [70, 90],
          [102, 90]
        ],
        ll: [
          [84, 104],
          [86, 150]
        ],
        rl: [
          [88, 108],
          [94, 150]
        ]
      }
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
      { t: "text", x: 90, y: 22, s: "z", size: 15 }
    ]
  },
  {
    key: "podium",
    name: "\u6F14\u8BB2",
    cat: "work",
    w: 120,
    h: 160,
    people: [
      P(66, {
        la: [
          [50, 62],
          [38, 46]
        ]
      })
    ],
    props: [
      front({
        t: "poly",
        pts: [
          [44, 90],
          [92, 94],
          [84, 152],
          [54, 152]
        ],
        fill: 0
      }),
      front(line([80, 92], [74, 70])),
      front({ t: "dot", c: [73, 66], r: 3.5 })
    ]
  },
  {
    key: "sticky",
    name: "\u4FBF\u7B7E",
    cat: "work",
    w: 144,
    h: 160,
    people: [
      P(50, {
        ra: [
          [70, 40],
          [92, 30]
        ]
      })
    ],
    props: [
      { t: "rect", x: 96, y: 8, w: 18, h: 18, fill: 0 },
      { t: "rect", x: 118, y: 8, w: 18, h: 18, fill: 1 },
      { t: "rect", x: 96, y: 30, w: 18, h: 18, fill: 2 },
      { t: "rect", x: 118, y: 30, w: 18, h: 18, fill: 3 },
      { t: "rect", x: 106, y: 52, w: 18, h: 18, fill: 4 }
    ]
  },
  // ───── 隐喻 ─────
  {
    key: "search",
    name: "\u63A2\u7D22",
    cat: "metaphor",
    w: 120,
    h: 160,
    people: [
      P(50, {
        h: [54, 28],
        ra: [
          [72, 64],
          [84, 52]
        ]
      })
    ],
    props: [
      front(line([84, 54], [92, 44])),
      front({ t: "circle", c: [99, 36], r: 10, fill: "paper" }),
      front(line([94, 33], [97, 30]))
    ]
  },
  {
    key: "push",
    name: "\u653B\u575A",
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
          [74, 96]
        ],
        ra: [
          [60, 88],
          [72, 108]
        ],
        ll: [
          [22, 128],
          [8, 152]
        ],
        rl: [
          [40, 126],
          [30, 152]
        ]
      }
    ],
    props: [
      line([0, 153], [140, 153]),
      front({ t: "circle", c: [100, 118], r: 34, fill: 0 })
    ]
  },
  {
    key: "ladder",
    name: "\u6500\u767B",
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
          [70, 34]
        ],
        ra: [
          [100, 50],
          [96, 34]
        ],
        ll: [
          [74, 124],
          [72, 154]
        ],
        rl: [
          [94, 112],
          [96, 134]
        ],
        bean: {
          h: [83, 42],
          n: [83, 56],
          p: [83, 96],
          la: [
            [60, 52],
            [68, 34]
          ],
          ra: [
            [106, 52],
            [98, 34]
          ],
          ll: [
            [72, 122],
            [70, 154]
          ],
          rl: [
            [98, 114],
            [98, 134]
          ]
        }
      }
    ],
    props: [
      line([66, 2], [66, 158]),
      line([100, 2], [100, 158]),
      ...[14, 34, 54, 74, 94, 114, 134, 154].map(
        (y) => line([66, y], [100, y])
      )
    ]
  },
  {
    key: "stairs",
    name: "\u8FDB\u9636",
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
          [64, 72]
        ],
        ra: [
          [92, 52],
          [100, 66]
        ],
        ll: [
          [72, 112],
          [68, 140]
        ],
        rl: [
          [94, 100],
          [96, 124]
        ]
      }
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
          [134, 84]
        ],
        fill: 0
      }
    ]
  },
  {
    key: "lost",
    name: "\u8FF7\u8DEF",
    cat: "metaphor",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [62, 40],
          [54, 18]
        ]
      })
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
          [82, 38]
        ],
        fill: 0
      },
      {
        t: "poly",
        pts: [
          [118, 54],
          [146, 54],
          [154, 62],
          [146, 70],
          [118, 70]
        ],
        fill: 1
      },
      { t: "text", x: 72, y: 10, s: "?", size: 18 }
    ]
  },
  {
    key: "balance",
    name: "\u6743\u8861",
    cat: "metaphor",
    w: 120,
    h: 160,
    people: [
      P(60, {
        h: [57, 27],
        la: [
          [40, 58],
          [18, 56]
        ],
        ra: [
          [80, 58],
          [102, 60]
        ]
      })
    ],
    props: [
      { t: "rect", x: 8, y: 38, w: 20, h: 18, fill: 0 },
      { t: "circle", c: [103, 51], r: 9, fill: 1 }
    ]
  },
  {
    key: "puzzle",
    name: "\u62FC\u5408",
    cat: "metaphor",
    w: 160,
    h: 160,
    people: [
      P(36, {
        ra: [
          [50, 66],
          [60, 74]
        ]
      }),
      P(124, {
        la: [
          [110, 66],
          [100, 74]
        ]
      })
    ],
    props: [
      front({ t: "poly", pts: puzzle(58, 56, 22, true), fill: 0 }),
      front({ t: "poly", pts: puzzle(80, 56, 22, false), fill: 1 })
    ]
  },
  {
    key: "target",
    name: "\u547D\u4E2D",
    cat: "metaphor",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [56, 34],
          [62, 14]
        ]
      })
    ],
    props: [
      line([112, 96], [104, 152]),
      line([136, 96], [144, 152]),
      { t: "circle", c: [124, 70], r: 30, fill: 0 },
      { t: "circle", c: [124, 70], r: 19, fill: "paper" },
      { t: "circle", c: [124, 70], r: 8, fill: 0 },
      front(line([92, 50], [124, 70])),
      front(line([92, 50], [84, 48])),
      front(line([92, 50], [90, 42]))
    ]
  },
  {
    key: "nurture",
    name: "\u57F9\u80B2",
    cat: "metaphor",
    w: 140,
    h: 160,
    people: [
      P(48, {
        ra: [
          [64, 64],
          [78, 70]
        ]
      })
    ],
    props: [
      {
        t: "poly",
        pts: [
          [104, 134],
          [128, 134],
          [124, 152],
          [108, 152]
        ],
        fill: 0
      },
      line([116, 134], [116, 106]),
      {
        t: "poly",
        pts: [
          [116, 122],
          [106, 116],
          [101, 106],
          [111, 109]
        ],
        fill: 2
      },
      {
        t: "poly",
        pts: [
          [116, 114],
          [126, 108],
          [131, 98],
          [121, 101]
        ],
        fill: 2
      },
      front({ t: "rect", x: 76, y: 64, w: 20, h: 16, fill: 1 }),
      front(line([80, 64], [86, 57], [92, 64])),
      front(line([96, 70], [108, 60])),
      { t: "dot", c: [111, 67], r: 1.6 },
      { t: "dot", c: [113, 75], r: 1.6 },
      { t: "dot", c: [110, 83], r: 1.6 }
    ]
  },
  // ───── 多人 ─────
  {
    key: "handshake",
    name: "\u63E1\u624B",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(46, {
        ra: [
          [62, 66],
          [79, 70]
        ]
      }),
      P(114, {
        la: [
          [98, 66],
          [81, 70]
        ]
      })
    ]
  },
  {
    key: "talk",
    name: "\u4EA4\u8C08",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(40, {
        ra: [
          [56, 68],
          [68, 60]
        ]
      }),
      P(120)
    ],
    props: [
      { t: "rect", x: 58, y: 0, w: 44, h: 24, fill: "paper" },
      line([66, 24], [59, 31], [74, 24]),
      { t: "dot", c: [70, 12], r: 1.8 },
      { t: "dot", c: [80, 12], r: 1.8 },
      { t: "dot", c: [90, 12], r: 1.8 }
    ]
  },
  {
    key: "team",
    name: "\u56E2\u961F",
    cat: "group",
    w: 180,
    h: 160,
    people: [
      P(36, {
        ra: [
          [50, 70],
          [63, 88]
        ]
      }),
      P(90, {
        la: [
          [78, 70],
          [63, 88]
        ],
        ra: [
          [102, 70],
          [117, 88]
        ]
      }),
      P(144, {
        la: [
          [130, 70],
          [117, 88]
        ]
      })
    ]
  },
  {
    key: "highfive",
    name: "\u51FB\u638C",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [60, 32],
          [78, 14]
        ]
      }),
      P(116, {
        la: [
          [100, 32],
          [82, 14]
        ]
      })
    ],
    props: [
      line([80, 4], [80, -2]),
      line([70, 6], [66, 1]),
      line([90, 6], [94, 1])
    ]
  },
  {
    key: "qa",
    name: "\u7B54\u7591",
    cat: "group",
    w: 200,
    h: 160,
    people: [
      P(36),
      P(84, {
        ra: [
          [96, 32],
          [100, 10]
        ]
      }),
      P(160, {
        la: [
          [146, 62],
          [128, 54]
        ]
      })
    ],
    props: [{ t: "text", x: 114, y: 8, s: "?", size: 16 }]
  },
  {
    key: "handover",
    name: "\u4EA4\u4ED8",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [60, 68],
          [72, 74]
        ]
      }),
      P(116, {
        la: [
          [100, 68],
          [88, 74]
        ]
      })
    ],
    props: [
      front({ t: "rect", x: 66, y: 58, w: 28, h: 26, fill: 0 }),
      front(line([66, 66], [94, 66]))
    ]
  },
  {
    key: "argue",
    name: "\u5206\u6B67",
    cat: "group",
    w: 160,
    h: 160,
    people: [
      P(44, {
        ra: [
          [62, 50],
          [74, 42]
        ]
      }),
      P(116, {
        la: [
          [98, 50],
          [86, 42]
        ]
      })
    ],
    props: [line([82, 2], [76, 14], [85, 16], [78, 30])]
  },
  {
    key: "meeting",
    name: "\u5F00\u4F1A",
    cat: "group",
    w: 200,
    h: 160,
    people: [
      P(50),
      P(100, {
        ra: [
          [114, 36],
          [120, 18]
        ]
      }),
      P(150)
    ],
    props: [front({ t: "rect", x: 14, y: 90, w: 172, h: 50, fill: "paper" })]
  }
];
var POSE_MAP = new Map(STICK_POSES.map((pose) => [pose.key, pose]));
var getStickPose = (key) => POSE_MAP.get(key);
var stickNaturalSize = (pose) => [
  pose.w + STICK_PADDING * 2,
  pose.h + STICK_PADDING * 2
];
var stickViewBox = (pose) => {
  const [w, h] = stickNaturalSize(pose);
  return `${-STICK_PADDING} ${-STICK_PADDING} ${w} ${h}`;
};

// src/model/strokes.ts
var import_whiteboard = require("@tau/plugins/whiteboard");
var { distance } = import_whiteboard.sketch;
var BODY_WIDTH = {
  classic: { limb: 3, spine: 3, prop: 2.4 },
  bean: { limb: 3, spine: 2.6, prop: 2.4 },
  glyph: { limb: 8, spine: 11, prop: 3 }
};
var lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t
];
var add = (p, v, d) => [
  p[0] + v[0] * d,
  p[1] + v[1] * d
];
function circlePoints(c, r, count = 40) {
  return Array.from({ length: count }, (_, i) => {
    const a = Math.PI * 2 * i / count;
    return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  });
}
function capsulePoints(a, b, r) {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const half = (center, from) => Array.from({ length: 15 }, (_, i) => {
    const t = from + Math.PI * i / 14;
    return [center[0] + Math.cos(t) * r, center[1] + Math.sin(t) * r];
  });
  return [...half(b, angle - Math.PI / 2), ...half(a, angle + Math.PI / 2)];
}
var rectPoints = (x, y, w, h) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];
function sideNormal(axisA, axisB, origin, toward) {
  const dx = axisB[0] - axisA[0];
  const dy = axisB[1] - axisA[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const side = (toward[0] - origin[0]) * nx + (toward[1] - origin[1]) * ny >= 0 ? 1 : -1;
  return [nx * side, ny * side];
}
function tintFill(tint, index) {
  return tint === "color" ? STICK_TINTS[index % STICK_TINTS.length] : STICK_MONO_FILL;
}
function personStrokes(person, body, tint, index) {
  const P2 = body === "bean" && person.bean ? { ...person, ...person.bean } : person;
  const width = BODY_WIDTH[body];
  const limb = (from, segment) => ({
    kind: "line",
    points: [from, ...segment],
    width: width.limb
  });
  const shoulder = lerp(P2.n, P2.p, 0.18);
  if (body === "classic") {
    return [
      limb(P2.p, P2.ll),
      limb(P2.p, P2.rl),
      { kind: "line", points: [P2.n, P2.p], width: width.spine },
      limb(shoulder, P2.la),
      limb(shoulder, P2.ra),
      {
        kind: "shape",
        points: circlePoints(P2.h, 13),
        width: width.spine,
        fill: STICK_PAPER
      }
    ];
  }
  if (body === "bean") {
    const len = distance(P2.n, P2.p);
    const top = lerp(P2.n, P2.p, 11 / len);
    const bottom = lerp(P2.n, P2.p, (len - 6) / len);
    const fill = tintFill(tint, index);
    const leg = (segment) => limb(add(P2.p, sideNormal(P2.n, P2.p, P2.p, segment[0]), 5), segment);
    const arm = ([elbow, hand]) => {
      const v = sideNormal(P2.n, P2.p, top, elbow);
      return limb(add(top, v, 4), [add(elbow, v, 8), add(hand, v, 5)]);
    };
    return [
      leg(P2.ll),
      leg(P2.rl),
      arm(P2.la),
      arm(P2.ra),
      {
        kind: "shape",
        points: capsulePoints(top, bottom, 12),
        width: width.spine,
        fill
      },
      {
        kind: "shape",
        points: circlePoints(P2.h, 14),
        width: width.spine,
        fill
      }
    ];
  }
  const headLen = distance(P2.h, P2.n);
  const head = lerp(P2.n, P2.h, (headLen + 3) / headLen);
  const neck = lerp(P2.n, P2.p, 7 / distance(P2.n, P2.p));
  return [
    limb(P2.p, P2.ll),
    limb(P2.p, P2.rl),
    { kind: "line", points: [neck, P2.p], width: width.spine },
    limb(shoulder, P2.la),
    limb(shoulder, P2.ra),
    { kind: "shape", points: circlePoints(head, 11), fill: "ink" }
  ];
}
function propStroke(prop, body, tint) {
  const width = BODY_WIDTH[body].prop;
  if (prop.t === "text")
    return {
      kind: "text",
      x: prop.x,
      y: prop.y,
      text: prop.s,
      size: prop.size
    };
  if (prop.t === "line") return { kind: "line", points: prop.pts, width };
  if (prop.t === "dot")
    return {
      kind: "shape",
      points: circlePoints(prop.c, prop.r, 12),
      fill: "ink"
    };
  const fill = prop.fill === void 0 ? null : prop.fill === "paper" ? STICK_PAPER : prop.fill === "warn" ? tint === "color" ? STICK_WARN_FILL : STICK_MONO_FILL : tintFill(tint, prop.fill);
  const points = prop.t === "poly" ? prop.pts : prop.t === "rect" ? rectPoints(prop.x, prop.y, prop.w, prop.h) : circlePoints(prop.c, prop.r, 32);
  return { kind: "shape", points, width, fill };
}
function mirror(stroke, w) {
  if (stroke.kind === "text") return { ...stroke, x: w - stroke.x };
  return { ...stroke, points: stroke.points.map(([x, y]) => [w - x, y]) };
}
function buildStickStrokes(pose, style) {
  const { body, tint } = style;
  const props = pose.props ?? [];
  const isText = (p) => p.t === "text";
  const strokes = [
    ...props.filter((p) => !isText(p) && !("z" in p && p.z)).map((p) => propStroke(p, body, tint)),
    ...pose.people.flatMap((person, i) => personStrokes(person, body, tint, i)),
    ...props.filter((p) => !isText(p) && "z" in p && p.z).map((p) => propStroke(p, body, tint)),
    ...props.filter(isText).map((p) => propStroke(p, body, tint))
  ];
  return style.flip ? strokes.map((s) => mirror(s, pose.w)) : strokes;
}

// src/model/render.ts
var import_whiteboard2 = require("@tau/plugins/whiteboard");
var {
  polylineToD,
  resample,
  wobble,
  inkOutline,
  inkSize,
  createRandom,
  loopStroke
} = import_whiteboard2.sketch;
var STICK_WOBBLE = {
  neat: { amplitude: 0.45, jitter: 0.5 },
  natural: { amplitude: 1, jitter: 1.2 },
  loose: { amplitude: 1.8, jitter: 2.2 }
};
var STICK_WAVE_SCALE = 0.55;
var THICK_LINE = 6;
var closed = (points) => [...points, points[0]];
function renderStickPrecise(strokes) {
  const paths = [];
  const texts = [];
  for (const stroke of strokes) {
    if (stroke.kind === "text") {
      texts.push({
        x: stroke.x,
        y: stroke.y,
        text: stroke.text,
        size: stroke.size
      });
    } else if (stroke.kind === "line") {
      paths.push({
        d: polylineToD(stroke.points),
        fill: "none",
        stroke: STICK_INK,
        strokeWidth: stroke.width
      });
    } else {
      paths.push({
        d: polylineToD(stroke.points, true),
        fill: stroke.fill === "ink" ? STICK_INK : stroke.fill ?? "none",
        stroke: stroke.width ? STICK_INK : void 0,
        strokeWidth: stroke.width
      });
    }
  }
  return { paths, texts };
}
function renderStickSketch(strokes, level, seed) {
  const random = createRandom(seed);
  const { amplitude, jitter } = STICK_WOBBLE[level];
  const shake = (p) => [
    p[0] + (random() - 0.5) * 2 * jitter,
    p[1] + (random() - 0.5) * 2 * jitter
  ];
  const paths = [];
  const texts = [];
  for (const stroke of strokes) {
    if (stroke.kind === "text") {
      texts.push({
        x: stroke.x,
        y: stroke.y,
        text: stroke.text,
        size: stroke.size * 1.15,
        rotate: Math.round((random() - 0.5) * 800) / 100
      });
      continue;
    }
    if (stroke.kind === "line") {
      const points = wobble(
        resample(stroke.points.map(shake), 2.5),
        amplitude,
        random,
        STICK_WAVE_SCALE
      );
      const w = stroke.width;
      const options = w >= THICK_LINE ? { thinning: 0.22, taperStart: w * 0.3, taperEnd: w * 0.8 } : { taperStart: w * 1.2, taperEnd: w * 3 };
      paths.push({
        role: "ink",
        d: inkOutline(points, inkSize(w), random, options),
        color: STICK_INK
      });
      continue;
    }
    const ring = resample(closed(stroke.points), 2.5);
    if (stroke.fill === "ink") {
      const d = polylineToD(
        wobble(ring, amplitude * 0.5, random, STICK_WAVE_SCALE),
        true
      );
      paths.push({ role: "ink", d, color: STICK_INK });
      continue;
    }
    if (stroke.fill) {
      const offset = stroke.fill === STICK_PAPER ? [0, 0] : [(random() - 0.2) * 2 * jitter, (random() - 0.2) * 2 * jitter];
      const fillRing = wobble(
        ring,
        amplitude * 0.6,
        random,
        STICK_WAVE_SCALE
      ).map((p) => [p[0] + offset[0], p[1] + offset[1]]);
      paths.push({
        role: "wash",
        d: polylineToD(fillRing, true),
        color: stroke.fill
      });
    }
    if (stroke.width) {
      const d = inkOutline(
        loopStroke(closed(stroke.points), amplitude * 0.7, random),
        inkSize(stroke.width),
        random
      );
      paths.push({ role: "ink", d, color: STICK_INK });
    }
  }
  return { paths, texts };
}

// src/element.tsx
var import_whiteboard4 = require("@tau/plugins/whiteboard");

// src/components/StickFigure.tsx
var import_react3 = require("react");
var import_whiteboard3 = require("@tau/plugins/whiteboard");
var import_jsx_runtime = require("react/jsx-runtime");
var { handTextClass } = import_whiteboard3.sketch;
function StickTexts({
  texts,
  className
}) {
  return texts.map((t, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "text",
    {
      x: t.x,
      y: t.y,
      textAnchor: "middle",
      dominantBaseline: "middle",
      fill: STICK_INK,
      fontSize: t.size,
      className,
      transform: t.rotate ? `rotate(${t.rotate} ${t.x} ${t.y})` : void 0,
      children: t.text
    },
    i
  ));
}
var StickFigure = (0, import_react3.memo)(
  ({ pose, body, tint, flip, sketch: sketch3 }) => {
    const strokes = (0, import_react3.useMemo)(
      () => buildStickStrokes(pose, { body, tint, flip }),
      [pose, body, tint, flip]
    );
    const { enabled, level, seed } = sketch3;
    const output = (0, import_react3.useMemo)(
      () => enabled ? renderStickSketch(strokes, level, seed) : null,
      [strokes, enabled, level, seed]
    );
    const precise = (0, import_react3.useMemo)(
      () => enabled ? null : renderStickPrecise(strokes),
      [strokes, enabled]
    );
    if (output) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { pointerEvents: "none", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_whiteboard3.SketchPaths, { paths: output.paths }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StickTexts, { texts: output.texts, className: handTextClass(sketch3) })
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { pointerEvents: "none", strokeLinecap: "round", strokeLinejoin: "round", children: [
      precise?.paths.map((p, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "path",
        {
          d: p.d,
          fill: p.fill,
          stroke: p.stroke,
          strokeWidth: p.strokeWidth
        },
        i
      )),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        StickTexts,
        {
          texts: precise?.texts ?? [],
          className: "tau-stickman-text"
        }
      )
    ] });
  }
);
var StickFigure_default = StickFigure;

// src/element.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var elementType = "taunote.stickman.figure";
var toolId = "taunote.stickman.create";
function Stickman({ element }) {
  const appearance = (0, import_whiteboard4.useSketch)(element);
  const pose = getStickPose(element.data.pose);
  if (!pose) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    "svg",
    {
      "data-stickman": element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      viewBox: stickViewBox(pose),
      preserveAspectRatio: "xMidYMid meet",
      style: { overflow: "visible" },
      children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        StickFigure_default,
        {
          pose,
          body: element.data.body,
          tint: element.data.tint,
          flip: element.data.flip,
          sketch: appearance
        }
      )
    }
  );
}
function repose(element, key) {
  const next = getStickPose(key);
  const previous = getStickPose(element.data.pose);
  if (!next || !previous) return element;
  const scale = element.width / stickNaturalSize(previous)[0];
  const [w, h] = stickNaturalSize(next);
  const width = w * scale, height = h * scale;
  return {
    ...element,
    x: element.x + (element.width - width) / 2,
    y: element.y + element.height - height,
    width,
    height,
    data: { ...element.data, pose: key }
  };
}
function schematic(element) {
  const pose = getStickPose(element.data.pose);
  if (!pose) return [];
  const [w, h] = stickNaturalSize(pose);
  const shapes = [];
  for (const stroke of buildStickStrokes(pose, {
    ...element.data,
    tint: "mono"
  })) {
    if (stroke.kind === "text") continue;
    const solid = stroke.kind === "shape" && stroke.fill === "ink";
    shapes.push({
      kind: "path",
      d: "M" + stroke.points.map(
        ([x, y]) => `${((x + STICK_PADDING) / w).toFixed(4)} ${((y + STICK_PADDING) / h).toFixed(4)}`
      ).join(" L") + (stroke.kind === "shape" ? " Z" : ""),
      fill: solid ? "var(--tau-ink-1)" : void 0,
      stroke: solid ? void 0 : "var(--tau-ink-1)",
      strokeWidth: 1,
      box: { x: element.x, y: element.y, w: element.width, h: element.height }
    });
  }
  return shapes;
}

// src/components/ToolPanel.tsx
var import_react5 = require("react");
var import_whiteboard6 = require("@tau/plugins/whiteboard");
var import_ui = require("@tau/ui");

// src/preferences.ts
async function readStyle(storage) {
  const value = await storage.get("style");
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    body: saved.body === "classic" || saved.body === "bean" || saved.body === "glyph" ? saved.body : DEFAULT_STICK_BODY,
    tint: saved.tint === "mono" || saved.tint === "color" ? saved.tint : DEFAULT_STICK_TINT
  };
}
function createStyleWriter(storage) {
  let pending = Promise.resolve();
  return (patch) => {
    const task = pending.catch(() => void 0).then(async () => {
      await storage.set("style", { ...await readStyle(storage), ...patch });
    });
    pending = task;
    return task;
  };
}

// src/components/PosePicker.tsx
var import_react4 = require("react");
var import_whiteboard5 = require("@tau/plugins/whiteboard");
var import_jsx_runtime3 = require("react/jsx-runtime");
var { hashSeed } = import_whiteboard5.sketch;
function StickGlyph({
  pose,
  body,
  tint,
  size
}) {
  const page = (0, import_whiteboard5.usePageSketch)();
  const sketch3 = {
    enabled: page.mode === "sketch",
    level: page.level,
    seed: hashSeed(pose.key)
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: stickViewBox(pose),
      style: { overflow: "visible" },
      children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StickFigure_default, { pose, body, tint, sketch: sketch3 })
    }
  );
}
var PosePicker = (0, import_react4.memo)(({ value, body, tint, onPick }) => {
  const [category, setCategory] = (0, import_react4.useState)(
    () => getStickPose(value ?? "")?.cat ?? STICK_CATEGORIES[0].key
  );
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "tau-stickman-picker", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_whiteboard5.Seg,
      {
        label: "\u4EBA\u7269\u5206\u7C7B",
        value: category,
        onChange: setCategory,
        options: STICK_CATEGORIES.map((c) => ({
          value: c.key,
          label: c.label
        }))
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "tau-stickman-poses", children: STICK_POSES.filter((pose) => pose.cat === category).map((pose) => /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "button",
      {
        type: "button",
        "aria-label": pose.name,
        "aria-pressed": pose.key === value,
        onClick: () => onPick(pose.key),
        className: "tau-stickman-pose",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StickGlyph, { pose, body, tint, size: 52 }),
          pose.name
        ]
      },
      pose.key
    )) })
  ] });
});
var PosePicker_default = PosePicker;

// src/components/ToolPanel.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function ToolPanel({ run }) {
  const api = (0, import_whiteboard6.useWhiteboardAPI)();
  const [style, setStyle] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)("");
  const [attempt, setAttempt] = (0, import_react5.useState)(0);
  (0, import_react5.useEffect)(() => {
    let cancelled = false;
    setError("");
    void readStyle(api.getService(import_whiteboard6.IPluginStorage)).then(
      (value) => {
        if (!cancelled) setStyle(value);
      },
      (reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : String(reason));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "tau-stickman-panel", children: error ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "alert", children: [
    error,
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_ui.Button, { onClick: () => setAttempt((value) => value + 1), children: "\u91CD\u8BD5" })
  ] }) : style ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PosePicker_default, { ...style, onPick: (pose) => run({ pose }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u4EBA\u7269\u6837\u5F0F\u2026" }) });
}

// src/components/Inspector.tsx
var import_react6 = require("react");
var import_whiteboard7 = require("@tau/plugins/whiteboard");
var import_jsx_runtime5 = require("react/jsx-runtime");
function Inspector({
  element,
  onChange,
  remember
}) {
  const [error, setError] = (0, import_react6.useState)("");
  const mounted = (0, import_react6.useRef)(false);
  (0, import_react6.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { pose, body, tint, flip } = element.data;
  const save = (style) => {
    onChange({ ...element, data: { ...element.data, ...style } });
    void remember(style).then(
      () => {
        if (mounted.current) setError("");
      },
      (reason) => {
        if (mounted.current)
          setError(
            `\u8BB0\u4F4F\u6837\u5F0F\u5931\u8D25\uFF1A${reason instanceof Error ? reason.message : String(reason)}`
          );
      }
    );
  };
  const standing = getStickPose(DEFAULT_STICK_POSE);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_whiteboard7.AttrPopover,
      {
        label: "\u59FF\u6001",
        icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(PersonStanding, { strokeWidth: 1.75 }),
        width: 348,
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          PosePicker_default,
          {
            value: pose,
            body,
            tint,
            onPick: (key) => onChange(repose(element, key))
          }
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_whiteboard7.AttrPopover,
      {
        label: "\u5F62\u4F53",
        icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(UserRound, { strokeWidth: 1.75 }),
        width: 240,
        children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          import_whiteboard7.OptionGrid,
          {
            cols: 3,
            tall: true,
            options: STICK_BODY_OPTIONS.map((o) => ({
              ...o,
              glyph: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                StickGlyph,
                {
                  pose: standing,
                  body: o.value,
                  tint,
                  size: 30
                }
              )
            })),
            value: body,
            onChange: (value) => save({ body: value })
          }
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_whiteboard7.AttrToggle,
      {
        label: "\u7740\u8272",
        icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Palette, { strokeWidth: 1.75 }),
        checked: tint === "color",
        onChange: (value) => save({ tint: value ? "color" : "mono" })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_whiteboard7.AttrToggle,
      {
        label: "\u6C34\u5E73\u7FFB\u8F6C",
        icon: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(FlipHorizontal2, { strokeWidth: 1.75 }),
        checked: flip,
        onChange: (value) => onChange({ ...element, data: { ...element.data, flip: value } })
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_whiteboard7.SketchPopover, { target: element, onChange }),
    error && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { role: "alert", children: error })
  ] });
}

// src/index.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var poseOf = (options) => getStickPose(
  typeof options?.pose === "string" ? options.pose : DEFAULT_STICK_POSE
);
var extension = (0, import_whiteboard8.defineWhiteboardExtension)({
  id: "taunote.stickman",
  name: "\u706B\u67F4\u4EBA",
  requires: [import_whiteboard8.IPluginStorage],
  elements: [
    (0, import_whiteboard8.defineElement)({
      type: elementType,
      schemaVersion: 1,
      render: Stickman,
      schema: {
        "~standard": {
          version: 1,
          vendor: "taunote.stickman",
          validate(value) {
            if (value && typeof value === "object" && "pose" in value && typeof value.pose === "string" && getStickPose(value.pose) && "body" in value && (value.body === "classic" || value.body === "bean" || value.body === "glyph") && "tint" in value && (value.tint === "color" || value.tint === "mono") && "flip" in value && typeof value.flip === "boolean")
              return {
                value: {
                  pose: value.pose,
                  body: value.body,
                  tint: value.tint,
                  flip: value.flip
                }
              };
            return {
              issues: [{ message: "\u4EBA\u7269\u59FF\u6001\u3001\u5F62\u4F53\u3001\u7740\u8272\u6216\u7FFB\u8F6C\u5B57\u6BB5\u65E0\u6548" }]
            };
          }
        }
      },
      presentation: {
        label: "\u4EBA\u7269",
        icon: PersonStanding,
        getName: (element) => getStickPose(element.data.pose)?.name ?? "\u4EBA\u7269"
      },
      interaction: {
        resize: { handles: "corners", preserveAspectRatio: true },
        connect: "rect"
      },
      sketch: true,
      schematic,
      create: {
        gesture: "click",
        defaultSize: [132, 172],
        after: "select",
        hint: (options) => [`\u70B9\u51FB\u653E\u7F6E\u300C${poseOf(options)?.name ?? "\u4EBA\u7269"}\u300D`],
        async build({ rect, options, api }) {
          const pose = poseOf(options);
          if (!pose) return null;
          const style = await readStyle(api.getService(import_whiteboard8.IPluginStorage));
          const [width, height] = stickNaturalSize(pose);
          return {
            id: crypto.randomUUID(),
            type: elementType,
            schemaVersion: 1,
            x: rect.x + (rect.width - width) / 2,
            y: rect.y + (rect.height - height) / 2,
            width,
            height,
            data: { pose: pose.key, ...style, flip: false }
          };
        }
      }
    })
  ],
  create: (api) => {
    const remember = createStyleWriter(api.getService(import_whiteboard8.IPluginStorage));
    return {
      tools: [
        {
          id: toolId,
          element: elementType,
          label: "\u4EBA\u7269",
          icon: PersonStanding,
          order: 15,
          group: "drawing",
          panel: ToolPanel
        }
      ],
      inspectors: {
        [elementType]: ({
          element,
          onChange
        }) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          Inspector,
          {
            element,
            onChange,
            remember
          }
        )
      }
    };
  }
});
var index_default = (0, import_plugins.definePlugin)({
  ...define_PLUGIN_META_default,
  whiteboardExtensions: [extension]
});
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/flip-horizontal-2.js:
lucide-react/dist/esm/icons/palette.js:
lucide-react/dist/esm/icons/person-standing.js:
lucide-react/dist/esm/icons/user-round.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.399.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
