/*
  减重插件 mock 数据 —— 【视觉参考，非导出源】
  2026-08-01 ~ 10-29 共 90 天；种子固定，三个方案看到的是同一份数据。
  生成模型：真实体重按基础速率 + 行动长期效果缓降；行动的短期效果（水分、胃容物）只体现在次日晨重。
  阶段：8/1–8/21 基线 → 8/22–9/11 饭后散步 → 9/12–10/2 16:8 断食 → 10/3–10/8 国庆 → 10/9 起 控碳水 + 散步。
*/
(function () {
  "use strict";
  const W = (window.W = window.W || {});
  const D = 86400000;
  const START = new Date(2026, 7, 1).getTime();
  const TODAY = new Date(2026, 9, 29).getTime();
  W.D = D;
  W.TODAY = TODAY;

  let seed = 20260801;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 6; i++) s += rnd();
    return (s - 3) * 1.41;
  };

  W.CATS = {
    diet: { name: "饮食", icon: "utensils" },
    move: { name: "运动", icon: "footprints" },
    fast: { name: "断食", icon: "hourglass" },
    rest: { name: "作息", icon: "moon" },
    cheat: { name: "放纵", icon: "cake" },
  };
  W.TAGS = [
    { id: "lowcarb", name: "控碳水", cat: "diet", eff: -0.24 },
    { id: "less", name: "晚饭减半", cat: "diet", eff: -0.14 },
    { id: "veg", name: "先吃菜", cat: "diet", eff: -0.04 },
    { id: "walk", name: "饭后散步", cat: "move", eff: -0.1 },
    { id: "run", name: "跑步 5km", cat: "move", eff: -0.13 },
    { id: "lift", name: "力量训练", cat: "move", eff: 0.04 },
    { id: "f168", name: "16:8 断食", cat: "fast", eff: -0.19 },
    { id: "sleep7", name: "睡够 7 小时", cat: "rest", eff: -0.06 },
    { id: "late", name: "熬夜", cat: "rest", eff: 0.12 },
    { id: "party", name: "聚餐", cat: "cheat", eff: 0.46 },
    { id: "snack", name: "夜宵", cat: "cheat", eff: 0.3 },
  ];
  W.tag = id => W.TAGS.find(t => t.id === id);

  // 每个阶段各标签的发生概率
  const BASE = {
    veg: 0.2,
    walk: 0.15,
    run: 0.1,
    lift: 0.15,
    sleep7: 0.4,
    late: 0.25,
    party: 0.1,
    snack: 0.2,
    less: 0.1,
  };
  const PHASES = [
    { until: new Date(2026, 7, 22).getTime(), p: BASE },
    { until: new Date(2026, 8, 12).getTime(), p: { ...BASE, walk: 0.9, run: 0.2, snack: 0.12 } },
    {
      until: new Date(2026, 9, 3).getTime(),
      p: { ...BASE, f168: 0.85, walk: 0.45, less: 0.2, snack: 0.05 },
    },
    {
      until: new Date(2026, 9, 9).getTime(),
      p: { ...BASE, party: 0.75, snack: 0.4, late: 0.5, sleep7: 0.2, walk: 0.2 },
    },
    {
      until: Infinity,
      p: { ...BASE, lowcarb: 0.8, walk: 0.75, less: 0.35, sleep7: 0.6, late: 0.12, snack: 0.06 },
    },
  ];

  const MEALS = {
    早: [
      "燕麦 + 牛奶 + 鸡蛋",
      "全麦面包 + 鸡蛋 + 美式",
      "包子 2 个 + 豆浆",
      "希腊酸奶 + 蓝莓",
      "鸡蛋 2 个 + 黄瓜",
    ],
    午: [
      "鸡胸肉沙拉",
      "公司食堂：半份米饭 + 青菜 + 鱼",
      "牛肉面（面减半）",
      "轻食碗：糙米 + 三文鱼",
      "黄焖鸡米饭",
    ],
    晚: ["清蒸鱼 + 西兰花", "番茄炒蛋 + 半碗饭", "火锅（聚餐）", "鸡腿 + 蔬菜汤", "沙拉 + 豆腐"],
    加餐: ["苹果", "一小把坚果", "奶茶（半糖）", "烤串 6 串", "无糖酸奶"],
  };
  const KCAL = {
    早: [320, 410, 450, 260, 180],
    午: [380, 520, 560, 610, 780],
    晚: [340, 480, 1250, 520, 300],
    加餐: [90, 160, 280, 540, 120],
  };

  const days = [];
  let fat = 82.6;
  let water = 0;
  for (let t = START, i = 0; t <= TODAY; t += D, i++) {
    const p = PHASES.find(ph => t < ph.until).p;
    const actions = W.TAGS.filter(tag => rnd() < (p[tag.id] || 0)).map(tag => tag.id);
    const sleepIdx = actions.indexOf("sleep7");
    if (actions.includes("late") && sleepIdx >= 0) actions.splice(sleepIdx, 1);
    const amTrue = fat + water;
    const am = Math.round((amTrue + gauss() * 0.16) * 10) / 10;
    const cheat = actions.some(a => W.tag(a).cat === "cheat");
    const pm = Math.round((am + 0.85 + rnd() * 0.6 + (cheat ? 0.45 : 0)) * 10) / 10;
    const eff = actions.reduce((s, a) => s + W.tag(a).eff, 0);
    fat += -0.038 + eff * 0.3;
    water = water * 0.35 + eff * 0.7;

    const age = (TODAY - t) / D;
    const meals = [];
    if (age < 12 || rnd() < 0.25)
      for (const slot of ["早", "午", "晚"].concat(cheat || rnd() < 0.3 ? ["加餐"] : [])) {
        let k = Math.floor(rnd() * 5);
        if (slot === "晚" && actions.includes("party")) k = 2;
        if (slot === "加餐" && actions.includes("snack")) k = 3;
        if (slot === "早" && actions.includes("f168")) continue;
        meals.push({ slot, text: MEALS[slot][k], kcal: KCAL[slot][k] });
      }
    days.push({
      t,
      i,
      am: rnd() < 0.06 && age > 20 ? null : am,
      pm: age === 0 || rnd() < 0.22 ? null : pm,
      actions: age === 0 ? ["lowcarb"] : actions,
      meals: age === 0 ? meals.slice(0, 1) : meals,
    });
  }
  W.days = days;
  W.dayAt = t => days.find(d => d.t === t);
  W.today = () => days[days.length - 1];

  W.GOAL = 72;
  W.HEIGHT = 1.76;
  W.EXPERIMENTS = [
    {
      id: "e0",
      name: "基线",
      note: "只记录，不刻意改变",
      from: START,
      to: new Date(2026, 7, 21).getTime(),
      base: true,
    },
    {
      id: "e1",
      name: "饭后散步 30 分钟",
      tags: ["walk"],
      from: new Date(2026, 7, 22).getTime(),
      to: new Date(2026, 8, 11).getTime(),
    },
    {
      id: "e2",
      name: "16:8 断食",
      tags: ["f168"],
      from: new Date(2026, 8, 12).getTime(),
      to: new Date(2026, 9, 2).getTime(),
    },
    {
      id: "e3",
      name: "国庆假期",
      note: "不算实验，用来对照放纵",
      from: new Date(2026, 9, 3).getTime(),
      to: new Date(2026, 9, 8).getTime(),
      off: true,
    },
    {
      id: "e4",
      name: "控碳水 + 散步",
      tags: ["lowcarb", "walk"],
      from: new Date(2026, 9, 9).getTime(),
      to: TODAY,
      running: true,
    },
  ];
})();
