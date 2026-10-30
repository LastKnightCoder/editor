/*
  减重插件二轮 mock 数据（记录为主：少吃 + 多动）—— 【视觉参考，非导出源】
  2026-08-31 ~ 10-29 共 60 天；种子固定。
  「少吃」= 当天摄入 ≤ 热量预算，「多动」= 运动 ≥ 30 分钟，都由记录自动判定，不需要手动打勾。
  体重模型：晨重 = 脂肪 + 水分 + 测量噪声；脂肪按 (摄入 − 消耗) / 7700 变化，大餐次日多存水。
*/
(function () {
  "use strict";
  const W = (window.W = window.W || {});
  const D = 86400000;
  const TODAY = new Date(2026, 9, 29).getTime();
  const START = TODAY - 59 * D;
  Object.assign(W, {
    D,
    TODAY,
    BUDGET: 1800,
    MOVE_GOAL: 30,
    TDEE: 2100,
    GOAL: 72,
    HEIGHT: 1.76,
    EXPERIMENTS: [],
  });

  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 6; i++) s += rnd();
    return (s - 3) * 1.41;
  };

  W.CATS = {
    diet: { name: "饮食", icon: "utensils" },
    move: { name: "运动", icon: "footprints" },
    cheat: { name: "聚餐", icon: "cake" },
  };
  W.TAGS = [
    { id: "eat", name: "少吃", cat: "diet" },
    { id: "move", name: "多动", cat: "move" },
    { id: "party", name: "聚餐", cat: "cheat" },
  ];
  W.tag = id => W.TAGS.find(t => t.id === id);

  const MENU = {
    早: {
      light: [
        ["鸡蛋 2 个 + 黄瓜", 180],
        ["希腊酸奶 + 蓝莓", 230],
        ["燕麦 + 牛奶", 300],
      ],
      normal: [
        ["包子 2 个 + 豆浆", 450],
        ["全麦面包 + 鸡蛋 + 拿铁", 420],
      ],
    },
    午: {
      light: [
        ["鸡胸肉沙拉", 380],
        ["轻食碗：糙米 + 三文鱼", 520],
        ["食堂：半份米饭 + 青菜 + 鱼", 480],
      ],
      normal: [
        ["牛肉面", 680],
        ["黄焖鸡米饭", 820],
        ["猪脚饭", 900],
      ],
    },
    晚: {
      light: [
        ["清蒸鱼 + 西兰花", 340],
        ["番茄炒蛋 + 半碗饭", 480],
        ["鸡腿 + 蔬菜汤", 450],
      ],
      normal: [
        ["红烧肉 + 一碗饭", 850],
        ["麻辣烫", 760],
      ],
      party: [
        ["火锅（聚餐）", 1300],
        ["烧烤 + 啤酒（聚餐）", 1450],
      ],
    },
    加餐: {
      light: [
        ["苹果", 90],
        ["无糖酸奶", 120],
      ],
      normal: [
        ["奶茶（半糖）", 280],
        ["薯片一包", 320],
        ["夜宵烤串", 540],
      ],
    },
  };
  const MOVES = [
    ["饭后散步", 30, 120],
    ["快走", 45, 220],
    ["跑步 5km", 32, 330],
    ["骑车", 40, 260],
  ];
  const pick = (slot, mode) => {
    const list = MENU[slot][mode];
    const [text, kcal] = list[Math.floor(rnd() * list.length)];
    return { slot, text, kcal };
  };

  W.recalc = d => {
    d.intake = d.meals.reduce((s, m) => s + m.kcal, 0);
    d.burn = d.moves.reduce((s, m) => s + m.kcal, 0);
    d.moveMin = d.moves.reduce((s, m) => s + m.min, 0);
    d.actions = [
      d.intake <= W.BUDGET && "eat",
      d.moveMin >= W.MOVE_GOAL && "move",
      d.party && "party",
    ].filter(Boolean);
  };

  const days = [];
  let fat = 81.2;
  let water = 0;
  for (let i = 0; i < 60; i++) {
    const t = START + i * D;
    const isToday = t === TODAY;
    const prog = i / 59;
    const discipline = 0.42 + 0.38 * prog;
    const wd = new Date(t).getDay();
    const party = !isToday && (wd === 5 || wd === 6) && rnd() < 0.4;
    const meals = ["早", "午", "晚"].map(slot =>
      pick(slot, slot === "晚" && party ? "party" : rnd() < discipline ? "light" : "normal")
    );
    if (party || rnd() < 0.45 - 0.25 * prog)
      meals.push(pick("加餐", party || rnd() < 0.6 ? "normal" : "light"));
    const moves = [];
    if (rnd() < 0.38 + 0.4 * prog) {
      const [text, min, kcal] = MOVES[Math.floor(rnd() * MOVES.length)];
      moves.push({ text, min, kcal });
    }
    const am = Math.round((fat + water + gauss() * 0.15) * 10) / 10;
    const day = { t, i, am, pm: null, meals, moves, party };
    W.recalc(day);
    day.pm = Math.round((am + 0.55 + day.intake / 3200 + rnd() * 0.3) * 10) / 10;
    fat += (day.intake - W.TDEE - day.burn) / 7700;
    water =
      water * 0.4 + (day.intake > 2400 ? 0.45 : day.intake < 1500 ? -0.12 : 0) + (party ? 0.25 : 0);
    if (i > 3 && i < 50 && rnd() < 0.22) day.pm = null;
    if (i === 12 || i === 33) day.am = null;
    if (isToday) {
      // 演示时刻 12:40：早、午已记，晚饭和运动还没发生
      day.meals = [
        { slot: "早", text: "鸡蛋 2 个 + 黄瓜", kcal: 180 },
        { slot: "午", text: "食堂：半份米饭 + 青菜 + 鱼", kcal: 480 },
        { slot: "加餐", text: "拿铁（燕麦奶）", kcal: 160 },
      ];
      day.moves = [];
      day.pm = null;
      W.recalc(day);
    }
    days.push(day);
  }
  W.days = days;
  W.dayAt = t => days.find(d => d.t === t);
  W.today = () => days[days.length - 1];
})();
