/*
  记账插件 mock 数据 —— 【视觉参考，非导出源】
  2026-05-01 ~ 10-29 共 182 天，种子固定，演示日期 10/29 周四 12:40。
  预算口径：月预算 = 固定支出（房租、话费、订阅，自动入账）+ 可控支出（餐饮 / 购物 / 交通 / 娱乐 / 人情 / 其他）。
*/
(function () {
  "use strict";
  const E = (window.E = window.E || {});
  const D = 86400000;
  const TODAY = new Date(2026, 9, 29).getTime();
  const START = new Date(2026, 4, 1).getTime();
  Object.assign(E, { D, TODAY, START, NOW: "12:40" });

  // 顺序固定（与 tokens.css 分类色一一对应），不随金额排序重排颜色
  E.CATS = [
    { id: "food", name: "餐饮", icon: "utensils", budget: 3000 },
    { id: "shop", name: "购物", icon: "bag", budget: 1500 },
    { id: "trans", name: "交通", icon: "bus", budget: 450 },
    { id: "fun", name: "娱乐", icon: "film", budget: 1500 },
    { id: "home", name: "居住", icon: "home", budget: 3900, fixed: true },
    { id: "social", name: "人情", icon: "gift", budget: 600 },
    { id: "other", name: "其他", icon: "dots", budget: 200 },
  ];
  E.cat = id => E.CATS.find(c => c.id === id);
  E.BUDGET = E.CATS.reduce((s, c) => s + c.budget, 0);
  E.ACCTS = ["微信", "支付宝", "招行信用卡"];

  let seed = 20261029;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const between = (a, b) => Math.round(a + rnd() * (b - a));

  const tx = [];
  let id = 0;
  const add = (t, time, cat, sub, note, amt, o = {}) =>
    tx.push({
      id: ++id,
      t,
      time,
      cat,
      sub,
      note,
      amt,
      acct: o.acct || pick(E.ACCTS),
      fixed: !!o.fixed,
    });

  const LUNCH = [
    "牛肉面",
    "黄焖鸡",
    "麻辣烫",
    "公司食堂",
    "轻食沙拉",
    "盖浇饭",
    "兰州拉面",
    "寿司便当",
  ];
  const DINNER = [
    "外卖 · 酸菜鱼",
    "外卖 · 烧腊饭",
    "楼下小馆",
    "外卖 · 披萨",
    "煮面（买菜）",
    "外卖 · 卤肉饭",
  ];
  const DRINK = ["瑞幸 生椰拿铁", "喜茶", "星巴克", "蜜雪冰城", "库迪"];
  const DAILY = ["洗衣液 / 纸巾", "超市日用", "牙膏牙刷", "垃圾袋 / 收纳"];
  const ONLINE = [
    "淘宝 · T 恤两件",
    "京东 · 充电器",
    "拼多多 · 拖鞋",
    "淘宝 · 床品",
    "京东 · 书三本",
    "得物 · 运动鞋",
  ];

  for (let t = START; t <= TODAY; t += D) {
    const d = new Date(t);
    const dow = d.getDay();
    const dom = d.getDate();
    const wk = dow > 0 && dow < 6;
    const isToday = t === TODAY;
    const holiday = t >= new Date(2026, 9, 1).getTime() && t <= new Date(2026, 9, 7).getTime();

    // 固定支出：每月自动入账
    if (dom === 1)
      add(t, "09:00", "home", "房租", `房租 · ${d.getMonth() + 1} 月`, 3500, {
        fixed: true,
        acct: "招行信用卡",
      });
    if (dom === 3)
      add(t, "08:00", "fun", "订阅", "iCloud 200G", 21, { fixed: true, acct: "支付宝" });
    if (dom === 5)
      add(t, "08:00", "home", "话费网费", "话费 + 宽带", 158, { fixed: true, acct: "支付宝" });
    if (dom === 12) add(t, "08:00", "fun", "订阅", "视频会员", 25, { fixed: true, acct: "微信" });
    if (dom === 20) add(t, "08:00", "fun", "订阅", "音乐会员", 15, { fixed: true, acct: "支付宝" });
    if (dom === 15)
      add(t, "20:10", "home", "水电燃气", "水电燃气", between(150, 260), { acct: "支付宝" });

    if (holiday) {
      if (dom === 1) {
        add(t, "07:40", "fun", "旅行", "高铁 · 成都往返", 980, { acct: "招行信用卡" });
        add(t, "10:00", "fun", "旅行", "酒店 3 晚", 540, { acct: "招行信用卡" });
      }
      if (dom <= 4) {
        add(
          t,
          "12:30",
          "food",
          "正餐",
          pick(["火锅", "串串", "钵钵鸡 + 冰粉", "蹄花 + 甜水面"]),
          between(70, 160)
        );
        add(
          t,
          "16:00",
          "fun",
          "旅行",
          pick(["景点门票", "熊猫基地门票", "宽窄巷子小吃", "伴手礼"]),
          between(40, 120)
        );
        add(t, "19:30", "trans", "打车", "打车", between(22, 60));
      } else {
        add(t, "12:30", "food", "正餐", pick(LUNCH), between(20, 40));
        add(t, "19:00", "food", "买菜", "买菜", between(40, 90));
      }
      continue;
    }

    if (rnd() < 0.7)
      add(
        t,
        "08:2" + between(0, 9),
        "food",
        "早餐",
        pick(["包子 + 豆浆", "便利店早餐", "煎饼果子"]),
        between(7, 16)
      );
    if (wk || rnd() < 0.6)
      add(t, "12:1" + between(0, 9), "food", "正餐", pick(LUNCH), between(22, 38));
    if (isToday) {
      add(t, "10:05", "food", "咖啡奶茶", "瑞幸 生椰拿铁", 16, { acct: "微信" });
      break;
    }
    if (wk && rnd() < 0.55)
      add(t, "15:0" + between(0, 9), "food", "咖啡奶茶", pick(DRINK), between(12, 32));
    if (rnd() < 0.85)
      add(t, "19:" + between(10, 59), "food", "正餐", pick(DINNER), between(22, 62));
    if (rnd() < 0.18)
      add(
        t,
        "22:" + between(10, 50),
        "food",
        "零食夜宵",
        pick(["烧烤夜宵", "便利店零食", "水果"]),
        between(18, 75)
      );

    if (wk) add(t, "08:50", "trans", "地铁公交", "地铁通勤", 10, { acct: "支付宝" });
    if (rnd() < 0.16)
      add(
        t,
        "21:" + between(10, 59),
        "trans",
        "打车",
        pick(["打车 · 加班回家", "打车"]),
        between(18, 48)
      );

    if (rnd() < 0.16) add(t, "20:" + between(10, 59), "shop", "日用", pick(DAILY), between(15, 95));
    if (rnd() < 0.08)
      add(t, "22:" + between(10, 59), "shop", "网购", pick(ONLINE), between(69, 420));
    if (rnd() < 0.06)
      add(t, "20:30", "fun", "电影演出", pick(["电影", "Livehouse"]), between(45, 180));
    if (rnd() < 0.05) add(t, "21:30", "fun", "游戏", "游戏充值", pick([30, 68, 128]));
    if (dow === 6 && rnd() < 0.35)
      add(
        t,
        "18:40",
        "social",
        "聚餐请客",
        pick(["和同事聚餐 AA", "请朋友吃饭"]),
        between(120, 360)
      );
    if (rnd() < 0.04)
      add(t, "11:00", "other", "医疗", pick(["药店", "门诊挂号"]), between(25, 120));
  }

  // 几笔可识别的大额，给分析和 AI 一些「故事」
  add(new Date(2026, 5, 18).getTime(), "00:12", "shop", "数码", "618 · 降噪耳机", 1299, {
    acct: "招行信用卡",
  });
  add(new Date(2026, 8, 13).getTime(), "17:00", "social", "红包礼物", "同学婚礼红包", 800, {
    acct: "微信",
  });
  add(new Date(2026, 6, 26).getTime(), "15:00", "shop", "衣服", "夏装换季", 560, {
    acct: "支付宝",
  });
  add(new Date(2026, 9, 24).getTime(), "20:05", "shop", "网购", "双十一定金 · 扫地机", 100, {
    acct: "支付宝",
  });
  add(new Date(2026, 9, 18).getTime(), "19:20", "social", "聚餐请客", "生日请客", 520, {
    acct: "招行信用卡",
  });
  add(new Date(2026, 9, 27).getTime(), "21:40", "food", "零食夜宵", "烧烤夜宵", 96, {
    acct: "微信",
  });

  tx.sort((a, b) => b.t - a.t || b.time.localeCompare(a.time));
  E.tx = tx;

  /* ============ 统计口径 ============ */
  E.monthStart = t => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  };
  E.daysInMonth = t => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  };
  E.inRange = (from, to) => tx.filter(x => x.t >= from && x.t <= to);
  E.sum = list => list.reduce((s, x) => s + x.amt, 0);
  E.byCat = list => {
    const m = Object.fromEntries(E.CATS.map(c => [c.id, 0]));
    for (const x of list) m[x.cat] += x.amt;
    return m;
  };
  E.daily = (from, to) => {
    const out = [];
    for (let t = from; t <= to; t += D) {
      const list = tx.filter(x => x.t === t);
      out.push({ t, total: E.sum(list), flex: E.sum(list.filter(x => !x.fixed)), list });
    }
    return out;
  };
  // 本月：时间进度 = 已过天数 / 当月天数（今天按 0.5 天计，避免中午就判超速）
  E.month = (ref = TODAY) => {
    const from = E.monthStart(ref);
    const n = E.daysInMonth(ref);
    const to = Math.min(TODAY, from + (n - 1) * D);
    const list = E.inRange(from, to);
    const elapsed = (to - from) / D + (to === TODAY ? 0.5 : 1);
    return {
      from,
      to,
      n,
      list,
      total: E.sum(list),
      cats: E.byCat(list),
      pace: Math.min(1, elapsed / n),
      daysLeft: n - Math.round((to - from) / D),
    };
  };
  E.months = () => {
    const out = [];
    for (let m = 4; m <= 9; m++) {
      const from = new Date(2026, m, 1).getTime();
      const list = E.inRange(from, from + (E.daysInMonth(from) - 1) * D);
      out.push({
        from,
        label: `${m + 1}月`,
        total: E.sum(list),
        cats: E.byCat(list),
        live: m === 9,
      });
    }
    return out;
  };
  E.subs = (list, cat) => {
    const m = {};
    for (const x of list.filter(x => x.cat === cat)) m[x.sub] = (m[x.sub] || 0) + x.amt;
    return Object.entries(m)
      .map(([name, amt]) => ({ name, amt }))
      .sort((a, b) => b.amt - a.amt);
  };
})();
