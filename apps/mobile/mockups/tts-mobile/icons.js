// TTS mockup 补充图标，基础图标来自 ../sync-mobile/icons.js。
Object.assign(window.ICONS, {
  "audio-lines": [
    ["path", { d: "M2 10v3" }],
    ["path", { d: "M6 6v11" }],
    ["path", { d: "M10 3v18" }],
    ["path", { d: "M14 8v7" }],
    ["path", { d: "M18 5v13" }],
    ["path", { d: "M22 10v3" }],
  ],
  play: [["polygon", { points: "6 3 20 12 6 21 6 3" }]],
  pause: [
    ["rect", { x: "14", y: "4", width: "4", height: "16", rx: "1" }],
    ["rect", { x: "6", y: "4", width: "4", height: "16", rx: "1" }],
  ],
  folder: [
    ["path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }],
  ],
  calendar: [
    ["rect", { x: "3", y: "5", width: "18", height: "16", rx: "2" }],
    ["path", { d: "M16 3v4M8 3v4M3 11h18" }],
  ],
  "file-text": [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4M8 13h8M8 17h6" }],
  ],
  "file-audio": [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
    ["path", { d: "M8 15v-3" }],
    ["path", { d: "M12 17v-7" }],
    ["path", { d: "M16 15v-3" }],
  ],
  mic: [
    ["rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }],
    ["path", { d: "M5 10a7 7 0 0 0 14 0" }],
    ["path", { d: "M12 17v5" }],
  ],
  search: [
    ["circle", { cx: "11", cy: "11", r: "8" }],
    ["path", { d: "m21 21-4.3-4.3" }],
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  eye: [
    ["path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  "eye-off": [
    ["path", { d: "m2 2 20 20" }],
    ["path", { d: "M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.1" }],
    ["path", { d: "M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.4-1.5" }],
    ["path", { d: "M9.9 9.9a3 3 0 0 0 4.2 4.2" }],
  ],
  "trash-2": [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
    ["path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }],
    ["path", { d: "M10 11v6M14 11v6" }],
  ],
  upload: [
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
    ["path", { d: "m7 9 5-5 5 5" }],
    ["path", { d: "M12 4v12" }],
  ],
  "volume-2": [
    ["path", { d: "M11 5 6 9H3v6h3l5 4Z" }],
    ["path", { d: "M16 9a5 5 0 0 1 0 6" }],
    ["path", { d: "M19 6a9 9 0 0 1 0 12" }],
  ],
  "circle-alert": [
    ["circle", { cx: "12", cy: "12", r: "10" }],
    ["path", { d: "M12 8v4M12 16h.01" }],
  ],
  moon: [["path", { d: "M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" }]],
  image: [
    ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
    ["circle", { cx: "8.5", cy: "8.5", r: "1.5" }],
    ["path", { d: "m21 15-5-5L5 21" }],
  ],
  users: [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" }],
    ["circle", { cx: "9", cy: "7", r: "4" }],
    ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" }],
  ],
  "book-open": [
    ["path", { d: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2Z" }],
    ["path", { d: "M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z" }],
  ],
  puzzle: [
    ["path", { d: "M19 13h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H7v-4H5a2 2 0 1 1 0-4h2V9H3V5h4V3a2 2 0 1 1 4 0v2h4v4h2a2 2 0 1 1 0 4Z" }],
  ],
});
