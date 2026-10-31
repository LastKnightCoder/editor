// 记账移动端 mockup 的示意数据与口径：固定种子生成 5 月 1 日到 10 月 22 日的流水，按插件 stats.ts 的口径算本月统计。
(function () {
  const CATS = [
    { id: "food", name: "餐饮", icon: "utensils-crossed", budget: 3000, c: 0 },
    { id: "shop", name: "购物", icon: "shopping-bag", budget: 1500, c: 1 },
    { id: "trans", name: "交通", icon: "bus", budget: 450, c: 2 },
    { id: "fun", name: "娱乐", icon: "film", budget: 800, c: 3 },
    { id: "home", name: "居住", icon: "house", budget: 3900, c: 4 },
    { id: "social", name: "人情", icon: "gift", budget: 600, c: 5 },
    { id: "other", name: "其他", icon: "circle-ellipsis", budget: 200, c: 6 },
  ];
  const RULES = [
    { day: 1, note: "房租", amt: 3500, cat: "home" },
    { day: 5, note: "话费", amt: 59, cat: "home" },
    { day: 12, note: "视频会员", amt: 25, cat: "fun" },
  ];
  const TODAY = "2026-10-22";
  const NOW = "12:40";

  let seed = 20261022;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = list => list[Math.floor(rnd() * list.length)];
  const between = (a, b) => Math.round(a + rnd() * (b - a));
  const pad = n => String(n).padStart(2, "0");
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const LUNCH = ["牛肉面", "黄焖鸡", "麻辣烫", "公司食堂", "轻食沙拉", "盖浇饭", "寿司便当"];
  const DINNER = ["外卖 酸菜鱼", "外卖 烧腊饭", "楼下小馆", "买菜", "外卖 卤肉饭"];
  const DRINK = ["瑞幸 生椰拿铁", "喜茶", "星巴克", "库迪"];
  const ONLINE = ["淘宝 T 恤两件", "京东 充电器", "拼多多 拖鞋", "京东 书三本", "超市日用"];
  const FUN = ["电影", "KTV", "展览门票", "桌游"];

  const txs = [];
  const add = (date, time, cat, note, amt, fixed = false) =>
    txs.push({ date, time, cat, note, amt, fixed });
  for (let d = new Date(2026, 4, 1); key(d) < TODAY; d.setDate(d.getDate() + 1)) {
    const date = key(d);
    const dow = d.getDay();
    const weekend = dow === 0 || dow === 6;
    for (const r of RULES)
      if (d.getDate() === r.day) add(date, "09:00", r.cat, r.note, r.amt, true);
    if (rnd() < 0.45) add(date, "08:10", "food", "包子豆浆", between(7, 12));
    if (rnd() < 0.55) add(date, "09:40", "food", pick(DRINK), between(10, 32));
    if (weekend ? rnd() < 0.6 : rnd() < 0.9)
      add(
        date,
        "12:20",
        "food",
        weekend ? "和朋友吃饭" : pick(LUNCH),
        weekend ? between(45, 110) : between(18, 35)
      );
    if (rnd() < 0.7) add(date, "19:10", "food", pick(DINNER), between(22, 58));
    if (!weekend && rnd() < 0.8) add(date, "08:50", "trans", "地铁", between(4, 8));
    if (rnd() < 0.14) add(date, "22:30", "trans", "打车回家", between(18, 46));
    if (rnd() < 0.17) add(date, "21:05", "shop", pick(ONLINE), between(29, 260));
    if (weekend && rnd() < 0.42) add(date, "15:00", "fun", pick(FUN), between(45, 150));
    if (rnd() < 0.035)
      add(date, "18:00", "social", pick(["生日红包", "请同事吃饭", "随礼"]), between(100, 500));
    if (rnd() < 0.05) add(date, "17:30", "other", pick(["快递", "打印", "修鞋"]), between(6, 30));
  }
  // 昨天和今天手写，保证各帧文字一致
  for (let i = txs.length - 1; i >= 0; i--) if (txs[i].date === "2026-10-21") txs.splice(i, 1);
  add("2026-10-21", "08:45", "food", "瑞幸 生椰拿铁", 13);
  add("2026-10-21", "12:15", "food", "黄焖鸡", 26);
  add("2026-10-21", "19:30", "shop", "超市日用", 68);
  add("2026-10-21", "22:40", "trans", "打车回家", 34);
  add("2026-10-22", "08:45", "food", "瑞幸 生椰拿铁", 13);
  add("2026-10-22", "08:52", "trans", "地铁", 5);
  add("2026-10-22", "12:20", "food", "牛肉面", 28);
  // 本月人情手写两笔，分类详情页的「花在哪」才好看
  for (let i = txs.length - 1; i >= 0; i--)
    if (txs[i].cat === "social" && txs[i].date.startsWith("2026-10")) txs.splice(i, 1);
  add("2026-10-06", "18:00", "social", "生日红包", 500);
  add("2026-10-15", "18:30", "social", "请同事吃饭", 125);
  txs.sort((a, b) => (a.date + a.time < b.date + b.time ? 1 : -1));

  const sum = list => list.reduce((s, t) => s + t.amt, 0);
  const monthOf = date => date.slice(0, 7);
  const daysIn = month =>
    new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const budget = CATS.reduce((s, c) => s + c.budget, 0);
  const month = monthOf(TODAY);
  const days = daysIn(month);
  const elapsed = Number(TODAY.slice(8)) - 0.5;
  const pace = elapsed / days;
  const list = txs.filter(t => monthOf(t.date) === month);
  const fixed = sum(list.filter(t => t.fixed));
  const fixedPlanned = Math.max(fixed, sum(RULES.map(r => ({ amt: r.amt }))));
  const total = sum(list);
  const flex = total - fixed;
  const daysLeft = days - Math.floor(elapsed);
  const allowance = (budget - fixedPlanned) / days;

  // 前 3 个月均值作「平时」
  const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
  const byCat = rows =>
    Object.fromEntries(CATS.map(c => [c.id, sum(rows.filter(t => t.cat === c.id))]));
  const history = MONTHS.map(m => {
    const rows = txs.filter(t => monthOf(t.date) === m);
    return { month: m, total: sum(rows), by: byCat(rows) };
  });
  const base = history.slice(2, 5);
  const cats = CATS.map(c => {
    const rows = list.filter(t => t.cat === c.id);
    const spent = sum(rows);
    const f = sum(rows.filter(t => t.fixed));
    const room = c.budget - f;
    const status =
      spent > c.budget ? "over" : room > 0 && (spent - f) / room > pace + 0.1 ? "fast" : "ok";
    const average = base.reduce((s, m) => s + m.by[c.id], 0) / base.length;
    return { ...c, spent, fixed: f, status, average, fixedOnly: spent > 0 && f === spent };
  });

  const calendar = [];
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${pad(d)}`;
    const rows = list.filter(t => t.date === date);
    const flexRows = rows.filter(t => !t.fixed);
    calendar.push({
      date,
      d,
      flex: sum(flexRows),
      fixed: sum(rows.filter(t => t.fixed)),
      by: byCat(flexRows),
      top: flexRows.reduce((best, t) => (!best || t.amt > best.amt ? t : best), null),
      future: date > TODAY,
    });
  }
  const lastSame = sum(
    txs.filter(t => monthOf(t.date) === "2026-09" && t.date.slice(8) <= TODAY.slice(8))
  );
  const todayRows = list.filter(t => t.date === TODAY);
  const today = sum(todayRows.filter(t => !t.fixed));
  const perDay = Math.max(0, budget - total - Math.max(0, fixedPlanned - fixed)) / daysLeft;

  window.EX = {
    CATS,
    RULES,
    TODAY,
    NOW,
    MONTHS,
    txs,
    history,
    cats,
    calendar,
    cat: id => cats.find(c => c.id === id),
    stat: {
      month,
      days,
      pace,
      budget,
      total,
      fixed,
      flex,
      fixedPlanned,
      daysLeft,
      allowance,
      lastSame,
      today,
      todayCount: todayRows.length,
      perDay,
      left: budget - total,
      paceRatio: flex / (budget - fixedPlanned),
    },
  };
})();
