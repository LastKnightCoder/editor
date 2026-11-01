// 方案 C：左侧关系图回答「谁连着谁」，右侧是状态与操作；配对走应用内弹窗，覆盖收在协调电脑节点的菜单
(() => {
  const C = (window.schemeC = {});
  const T = ui.T;
  const TABS = [["设备同步", true], ["云端存储"], ["资源文件"], ["本地数据库"]];
  const page = (body, overlay = "") => shell.desktop({ body, overlay, tabs: TABS });
  const SPOTS = [
    [18, 22],
    [82, 22],
    [18, 78],
    [82, 78],
  ];
  const node = (x, y, ic, name, sub, cls = "", extra = "") =>
    `<div class="gnode ${cls}" style="left:${x}%;top:${y}%"><span class="gi">${icon(ic, cls.includes("hub") ? "lg" : "")}</span><b>${name}</b>${sub ? `<small>${sub}</small>` : ""}${extra}</div>`;
  const lines = segs =>
    `<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">${segs.map(([x1, y1, x2, y2, cls]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls || ""}" vector-effect="non-scaling-stroke"/>`).join("")}</svg>`;

  function hubGraph(ghost) {
    const d = ui.d();
    const plus = STATE.api === "plus";
    if (ghost)
      return `<div class="graph">${lines(SPOTS.map(([x, y]) => [50, 50, x, y, "dash"]))}${node(50, 50, "laptop", "这台电脑", "", "hub ghost")}${SPOTS.map(([x, y]) => node(x, y, "plus", "", "", "ghost")).join("")}</div>`;
    const peers = d.peers.slice(0, 4);
    const segs = peers.map((p, i) => [
      50,
      50,
      SPOTS[i][0],
      SPOTS[i][1],
      plus ? (p.seen === "刚刚连接" ? "live" : p.seen.includes("天") ? "dash" : "") : "",
    ]);
    return `<div class="graph">${lines(segs)}${node(50, 50, "laptop", "这台电脑", "协调中", "hub")}
      ${peers.map((p, i) => node(SPOTS[i][0], SPOTS[i][1], ui.peerIcon(p), p.name, ui.peerSub(p))).join("")}
      <div class="legend">${plus ? "绿线：刚刚连接过 · 虚线：几天没连接" : "连线表示已配对，不代表此刻在线"}</div></div>`;
  }
  function connGraph(s) {
    const d = ui.d();
    const offline = s === "offline",
      unpaired = s === "unpaired";
    const more = unpaired
      ? ""
      : `<span style="position:absolute;right:-30px;top:6px">${ui.ibtn("more", { menu: "hub-more", label: "协调电脑操作", cls: "sm" })}</span>
      ${ui.menu(
        "hub-more",
        [
          { label: "立即补齐", icon: "refresh", toast: "已补齐" },
          { label: "暂停自动连接", icon: "pause", toast: "已暂停（演示）" },
          { label: "重新粘贴配对信息", icon: "link", go: "conn-dialog" },
          "-",
          {
            label: "下载协调电脑版本并覆盖本机",
            sub: offline ? "连上后才能使用" : "丢弃本机未同步的修改",
            icon: "download",
            danger: true,
            go: "ow-confirm",
            disabled: offline,
          },
        ],
        "left:50%;top:84px;transform:translateX(-50%);min-width:260px"
      )}`;
    return `<div class="graph">${lines([[50, 30, 50, 72, unpaired || offline ? "dash" : "live"]])}
      ${node(50, 26, unpaired ? "plus" : "hub", unpaired ? "协调电脑" : d.coordinator, unpaired ? "尚未连接" : offline ? "暂时连不上" : "刚刚补齐", unpaired ? "ghost" : "hub", more)}
      ${node(50, 76, "laptop", "这台电脑", d.replicaLibrary)}
      ${offline ? `<div style="position:absolute;left:50%;top:51%;transform:translate(-50%,-50%);color:var(--tau-warn);background:var(--tau-bg-surface);padding:2px">${icon("wifiOff")}</div>` : ""}</div>`;
  }
  const side = (t, s, acts, rest = "") =>
    `<div class="side-col"><div class="t">${t}</div><div class="s">${s}</div><div class="row-acts">${acts}</div>${rest}</div>`;

  const pairDialog = fresh => `<div class="scrim"><div class="dialog lg"><h3>添加一台设备</h3>
    <div class="wsteps"><span class="on"><span class="step-n">1</span>复制配对信息</span><i></i><span><span class="step-n idle">2</span>在那台设备粘贴</span><i></i><span><span class="step-n idle">3</span>自动出现在关系图里</span></div>
    <p>在那台设备的设置 → 同步里粘贴。每份只给一台设备，只发给你自己的设备。</p>
    ${ui.code(false)}
    <div class="pair-meta"><span>${icon("clock", "sm")} ${DEMO.expiresAt} 前有效</span><span class="waiting"><span class="ring-spin"></span>等待那台设备配对…</span></div>
    <div class="foot">${ui.btn("重新生成", { cls: "ghost", toast: "已生成新的配对信息，之前那份已失效" })}${ui.btn(fresh ? "稍后再加" : "完成", { go: "on" })}</div></div></div>`;
  const connDialog = () => `<div class="scrim"><div class="dialog"><h3>连接协调电脑</h3>
    <div class="wsteps"><span class="on"><span class="step-n">1</span>在协调电脑点「添加设备」</span><i></i><span><span class="step-n idle">2</span>粘贴到这里</span></div>
    <p>${T.firstCopy}${T.rePair}</p>
    <textarea class="paste" rows="3" placeholder="粘贴以 tau-pair: 开头的配对信息">${DEMO.code}</textarea>
    <div class="foot">${ui.btn("取消", { go: "unpaired" })}${ui.btn("配对并建立本机副本", { cls: "primary", go: "daily", toast: "已配对，正文已同步" })}</div></div></div>`;
  const facts = d =>
    `<div class="list"><div class="facts" style="grid-template-columns:1fr 1fr"><div><div class="k">本机资料库</div><div class="v">${d.replicaLibrary}</div></div><div><div class="k">自动补齐</div><div class="v">打开、唤醒、切回窗口时</div></div></div></div>`;

  C.coord = s => {
    const d = ui.d();
    if (s === "unset")
      return page(
        `<section class="sheet"><div class="graph-sheet">${hubGraph(true)}${side(
          "让这份资料库在你的设备之间同步",
          `一台电脑协调，其他电脑和手机连接它。${T.notAllOnline}`,
          "",
          `<div class="choice" style="margin-top:4px"><div class="peer" data-go="fresh"><span class="pi">${icon("hub")}</span><span class="pn"><b>由本机协调</b><small>资料最完整、常开的电脑</small></span>${icon("chevR")}</div>
         <div class="peer" data-go="conn:conn-dialog"><span class="pi">${icon("link")}</span><span class="pn"><b>连接已有协调电脑</b><small>粘贴协调电脑给的配对信息</small></span>${icon("chevR")}</div></div>
         <p class="muted" style="margin:14px 0 0;font-size:12px">${T.scope}</p>`
        )}</div></section>`
      );
    if (s === "fresh")
      return page(
        `<section class="sheet"><div class="graph-sheet">${hubGraph(true)}${side("本机正在协调", "还没有配对的设备", ui.btn("添加设备", { cls: "primary", icon: "plus", go: "pairing" }))}</div></section>`,
        pairDialog(true)
      );
    const body = `<section class="sheet"><div class="graph-sheet">${hubGraph(false)}${side(
      `本机正在协调「${DEMO.library}」`,
      `已配对 ${d.peers.length} 台设备 · 最近收到修改 3 分钟前`,
      ui.btn("添加设备", { cls: "primary", icon: "plus", go: "pairing" }) +
        ui.ibtn("more", { menu: "c-more" }) +
        ui.menu(
          "c-more",
          [
            { label: "暂停局域网连接", icon: "pause", toast: "已暂停（演示）" },
            ...d.peers.map(p => ({
              label: `解除「${p.name}」`,
              icon: "unlink",
              danger: true,
              toast: "已解除（演示）",
            })),
          ],
          "left:0;top:38px"
        ),
      `<p class="muted" style="margin:18px 0 0;font-size:12px">${T.scope}</p>`
    )}</div></section>`;
    return page(body, s === "pairing" ? pairDialog(false) : "");
  };

  C.conn = s => {
    const d = ui.d();
    if (s === "unpaired" || s === "conn-dialog") {
      const base = `<section class="sheet"><div class="graph-sheet">${connGraph("unpaired")}${side("连接已有协调电脑", "在协调电脑的设置 → 同步里点「添加设备」，把配对信息粘贴过来。", ui.btn("粘贴配对信息", { cls: "primary", icon: "clipboard", go: "conn-dialog" }))}</div></section>`;
      return page(base, s === "conn-dialog" ? connDialog() : "");
    }
    const offline = s === "offline";
    const body = `<section class="sheet"><div class="graph-sheet">${connGraph(s)}${side(
      offline ? "暂时连不上协调电脑" : "已与协调电脑同步",
      offline ? `${T.offlineOk}上次同步 今天 09:12。` : `刚刚补齐 · ${T.notAllOnline}`,
      ui.btn(offline ? "重试" : "立即补齐", {
        icon: "refresh",
        toast: offline ? "仍连不上（演示）" : "已补齐",
      }),
      `${offline ? `<div class="reason"><b>可以检查</b><ul style="margin:4px 0 0;padding-left:16px">${T.troubleshoot.map(x => `<li>${x}</li>`).join("")}</ul></div>` : ""}${facts(d)}
       <p class="muted" style="margin:16px 0 0;font-size:12px">暂停、重新配对与下载覆盖在协调电脑节点的 ⋯ 里。</p>`
    )}</div></section>`;
    const ow = { "ow-confirm": "confirm", "ow-running": "running", "ow-failed": "failed" }[s];
    return page(body, ow ? ui.dlgOverwrite(ow) : "");
  };

  // 手机 C：顶部一条「手机 ↔ 电脑」关系条；低频操作全部收进页头 ⋯
  const mGraph = s => {
    const d = ui.d();
    const unpaired = s === "unpaired" || s === "pair-sheet",
      offline = s === "offline";
    return `<div class="m-graph"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><line x1="28" y1="40" x2="72" y2="40" class="${unpaired || offline ? "dash" : "live"}" vector-effect="non-scaling-stroke"/></svg>
      ${node(20, 40, "phone", "这台手机", "")}${node(80, 40, unpaired ? "plus" : "laptop", unpaired ? "协调电脑" : d.coordinator, unpaired ? "尚未连接" : offline ? "暂时连不上" : "刚刚补齐", unpaired ? "ghost" : "hub")}</div>`;
  };
  const headMenu = s =>
    ui.ibtn("more", { menu: "m-more", label: "更多" }) +
    ui.menu(
      "m-more",
      [
        { label: "立即补齐", icon: "refresh", toast: "已补齐" },
        { label: "重新粘贴配对信息", icon: "link", go: "pair-sheet" },
        "-",
        {
          label: "用电脑版本覆盖这台手机",
          icon: "download",
          danger: true,
          go: "ow-confirm",
          disabled: s === "offline",
          sub: s === "offline" ? "连上电脑后才能使用" : undefined,
        },
      ],
      "right:0;top:40px;min-width:240px"
    );
  const pairSheet =
    () => `<div class="m-scrim" data-go="unpaired"></div><div class="m-sheet"><div class="grab"></div><h3>粘贴配对信息</h3>
    <p>电脑：设置 → 同步 → 添加设备，复制后回到这里。${T.firstCopy}</p>
    <textarea class="paste" rows="3" style="font-size:13px">${DEMO.code}</textarea>
    <div class="acts">${ui.mbtn("配对", { cls: "primary", go: "daily", toast: "已配对" })}${ui.mbtn("取消", { cls: "plain", go: "unpaired" })}</div></div>`;
  C.mobile = s => {
    const d = ui.d();
    if (s === "unpaired" || s === "pair-sheet")
      return shell.phone({
        body: `<div class="m-label">局域网设备同步</div><div class="m-group pad">${mGraph(s)}${ui.mstatus({ tone: "", ic: "link", t: "还没有连接电脑", s: "电脑上的 Tau 负责协调。连上后手机可离线编辑，回到同一个局域网自动补齐。" })}</div>
          <p class="m-note">第一次会请求「本地网络」权限，选允许。</p>`,
        dock: ui.mbtn("粘贴配对信息", { cls: "primary", icon: "clipboard", go: "pair-sheet" }),
        overlay: s === "pair-sheet" ? pairSheet() : "",
      });
    const offline = s === "offline";
    const status = offline
      ? ui.mstatus({ tone: "warn", ic: "wifiOff", t: "暂时连不上协调电脑", s: `${T.offlineOk}` })
      : ui.mstatus({
          tone: "ok",
          ic: "checkCircle",
          t: "已与协调电脑同步",
          s: "打开 Tau、回到前台或重新联网时自动补齐。",
        });
    const ow = { "ow-confirm": "confirm", "ow-running": "running", "ow-failed": "failed" }[s];
    return shell.phone({
      headEnd: headMenu(s),
      body: `<div class="m-label">局域网设备同步</div><div class="m-group pad">${mGraph(s)}${status}</div>
        <div class="m-group" style="margin-top:12px"><div class="m-row"><span class="m-tile">${icon("database")}</span><span class="grow">本机资料库</span><span class="val">${d.replicaLibrary}</span></div></div>
        <p class="m-note">重新配对、用电脑版本覆盖在右上角 ⋯ 里；暂停与解除配对在协调电脑上操作。</p>
        <div class="m-label">另一种方式</div><div class="m-group"><div class="m-row tap"><span class="m-tile">${icon("cloud")}</span><span class="grow">云端存储同步</span><span class="val">未配置</span><span class="chev">${icon("chevR")}</span></div></div>`,
      overlay: ow ? ui.sheetOverwrite(ow) : "",
    });
  };

  C.notes = (view, s) =>
    ({
      "coord.unset": [
        "关系图先画出「一台协调、多台连接」的形状，虚线占位",
        "两条路是右侧两行选项，不做大卡片",
      ],
      "coord.on": [
        "关系图回答「谁连着谁」；现有接口下连线只表示已配对",
        "切到「补充字段后」：连线按最近连接时间区分",
        "超过 4 台时图会拥挤，需要「+N」折叠",
      ],
      "coord.pairing": ["配对走应用内弹窗，页面本身始终只有日常状态"],
      "conn.unpaired": ["连接端的关系图只有两点：这台电脑与协调电脑"],
      "conn.daily": [
        "覆盖、暂停、重新配对都收在协调电脑节点的 ⋯ 里",
        "日常页最安静，但覆盖入口较隐蔽",
      ],
      "conn.offline": ["连线变虚、中间一个断网图标"],
      "conn.ow-confirm": ["与方案 A 共用一次确认对话框"],
      "mobile.unpaired": ["顶部关系条 + 拇指区「粘贴配对信息」，粘贴走底部面板"],
      "mobile.daily": ["页头 ⋯ 收纳全部低频操作，正文只有关系条和一句状态"],
      "mobile.offline": ["连线变虚，覆盖菜单项置灰"],
      "mobile.ow-confirm": ["与方案 A 共用底部面板确认"],
    })[`${view}.${s}`] || [];
})();
