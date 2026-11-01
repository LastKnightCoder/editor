// 方案 B：首次是三步向导；配对后收成一行状态条，设备与低频操作折进可展开段。云端存储同页并列在下
(() => {
  const B = (window.schemeB = {});
  const T = ui.T;
  const cloud = `<div class="sec-title" style="margin-top:30px"><h3>云端存储同步</h3><span>经你自己的存储服务同步数据库与资源</span></div>
    <section class="sheet"><div class="cloud-ph">${icon("cloud", "lg")}<span>未配置 · 选择一个存储服务后即可同步</span><span style="margin-left:auto">${ui.btn("选择服务", { cls: "sm" })}</span></div></section>`;
  const page = (body, overlay = "") =>
    shell.desktop({
      body: `<div class="sec-title"><h3>局域网设备同步</h3><span>一台电脑协调，其他电脑和手机连接它</span></div>${body}${cloud}`,
      overlay,
    });
  const rail = (at, labels = ["选择本机角色", "交换配对信息", "首次同步"]) =>
    `<div class="wiz-rail">${labels.map((l, i) => `<div class="${i < at ? "done" : i === at ? "on" : ""}"><span class="step-n ${i < at ? "done" : i === at ? "" : "idle"}">${i < at ? icon("check", "sm") : i + 1}</span>${l}</div>`).join("")}</div>`;
  const disc = (id, title, sub, inner) =>
    `<div class="disc ${STATE.open[id] ? "open" : ""}" data-toggle="${id}"><b>${title}</b><span class="muted">${sub}</span>${icon("chevD", "chev")}</div>${STATE.open[id] ? inner : ""}`;
  const advRow = (ic, t, sub, o = {}) =>
    `<div class="peer"><span class="pi" ${o.danger ? 'style="color:var(--tau-danger);background:var(--tau-danger-soft)"' : ""}>${icon(ic)}</span><span class="pn"><b ${o.danger ? 'style="color:var(--tau-danger)"' : ""}>${t}</b><small>${sub}</small></span>${o.btn || ""}</div>`;

  function wizardRole(view) {
    const coord = view === "coord";
    return `<section class="sheet"><div class="wiz">${rail(0)}<div class="wiz-main">
      <h2>这台电脑在同步里做什么？</h2><p>${T.coordOnly}</p>
      <div class="pick">
        <label class="${coord ? "on" : ""}" data-go="coord:unset"><span class="radio"></span><div><b>由本机协调</b><span>资料最完整、平时常开的电脑。其他设备都连接它。</span></div></label>
        <label class="${coord ? "" : "on"}" data-go="conn:unpaired"><span class="radio"></span><div><b>连接已有协调电脑</b><span>已经有一台电脑在协调这份资料库。${T.firstCopy}</span></div></label>
      </div>
      ${coord ? "" : `<div style="margin-top:16px"><textarea class="paste" rows="2" placeholder="粘贴以 tau-pair: 开头的配对信息">${DEMO.code}</textarea></div>`}
      <div class="wiz-foot"><span class="muted" style="margin-right:auto;font-size:12px">${T.scope}</span>${ui.btn(coord ? "开启并继续" : "配对并继续", { cls: "primary", go: coord ? "pairing" : "daily", toast: coord ? undefined : "已配对，正文已同步" })}</div>
    </div></div></section>`;
  }
  function wizardPair() {
    return `<section class="sheet"><div class="wiz">${rail(1, ["开启协调", "把配对信息给那台设备", "等待配对完成"])}<div class="wiz-main">
      <h2>把配对信息给那台设备</h2><p>在那台设备的设置 → 同步里粘贴。每份只给一台设备，${DEMO.expiresAt} 前有效。</p>
      ${ui.code(false)}
      <div class="pair-meta"><span class="waiting"><span class="ring-spin"></span>等待那台设备配对…</span><span class="end">${ui.btn("重新生成", { cls: "sm ghost", toast: "已生成新的配对信息，之前那份已失效" })}</span></div>
      <div class="wiz-foot">${ui.btn("稍后再加", { cls: "ghost", go: "on" })}</div>
    </div></div></section>`;
  }

  B.coord = s => {
    if (s === "unset") return page(wizardRole("coord"));
    if (s === "pairing") return page(wizardPair());
    const d = ui.d();
    const strip = `<div class="strip"><span class="dot ok"></span><span class="t">本机正在协调</span><span class="s">已配对 ${d.peers.length} 台 · 最近收到修改 3 分钟前</span>
      <span class="acts">${ui.btn("添加设备", { cls: "primary", icon: "plus", go: "pairing" })}</span></div>`;
    const devices = `<div class="tiles">${d.peers.map(p => `<div class="peer"><span class="pi">${icon(ui.peerIcon(p))}</span><span class="pn"><b>${p.name}</b><small>${ui.peerSub(p)}</small></span>${ui.ibtn("more", { menu: `b-${p.id}` })}${ui.menu(`b-${p.id}`, [{ label: "解除配对", icon: "unlink", danger: true, toast: `已解除「${p.name}」的配对（演示）` }], "right:0;top:40px")}</div>`).join("")}</div>`;
    const adv = `<div class="adv">${advRow("pause", "暂停局域网连接", "其他设备暂时连不上，各自仍可编辑", { btn: ui.btn("暂停", { cls: "sm", toast: "已暂停（演示）" }) })}</div>`;
    return page(
      `<section class="sheet">${strip}${disc("b-dev", "设备", `${d.peers.length} 台已配对 · 不必同时在线`, devices)}${disc("b-adv", "高级与恢复", "暂停连接", adv)}</section>`
    );
  };

  function connSheet(s) {
    const d = ui.d();
    const offline = s === "offline";
    const strip = offline
      ? `<div class="strip"><span class="dot warn"></span><span class="t">暂时连不上协调电脑</span><span class="s">本机照常编辑 · 上次同步 09:12</span><span class="acts">${ui.btn("重试", { icon: "refresh", toast: "仍连不上（演示）" })}</span></div>
         <div class="reason"><b>可以检查</b>　${T.troubleshoot.join("；")}。</div>`
      : `<div class="strip"><span class="dot ok"></span><span class="t">已与协调电脑同步</span><span class="s">刚刚补齐 · ${d.coordinator}</span><span class="acts">${ui.btn("立即补齐", { icon: "refresh", toast: "已补齐" })}</span></div>`;
    const info = `<div class="facts" style="margin-top:6px"><div><div class="k">本机资料库</div><div class="v">${d.replicaLibrary}</div></div><div><div class="k">协调电脑</div><div class="v">${d.coordinator}</div></div><div><div class="k">自动补齐</div><div class="v">打开、唤醒、切回窗口时</div></div></div>`;
    const adv = `<div class="adv">
      ${advRow("pause", "暂停自动连接", "本机照常编辑，恢复后补齐", { btn: ui.btn("暂停", { cls: "sm", toast: "已暂停（演示）" }) })}
      ${advRow("link", "重新粘贴配对信息", "协调电脑换了网络地址时使用", { btn: ui.btn("粘贴", { cls: "sm" }) })}
      ${advRow("download", "下载协调电脑版本并覆盖本机", offline ? "连上协调电脑后才能使用" : "丢弃本机未同步的修改，以协调电脑为准", { danger: true, btn: ui.btn("覆盖…", { cls: "sm danger-soft", go: "ow-confirm", disabled: offline }) })}</div>`;
    return `<section class="sheet">${strip}${disc("b-info", "这台电脑", d.replicaLibrary, info)}${disc("b-cadv", "高级与恢复", "暂停、重新配对、下载覆盖", adv)}</section>`;
  }
  // B 的覆盖确认：宽对话框，「会丢弃 / 不受影响」两栏对照
  const owDialog =
    () => `<div class="scrim"><div class="dialog lg"><h3>下载协调电脑版本并覆盖本机</h3><span class="ctx badge">${ui.d().replicaLibrary}</span>
    <p>${T.owWhat}</p>
    <div class="foot-cols" style="margin-top:6px"><div><b style="color:var(--tau-danger)">这台电脑会丢弃</b><ul>${T.owLose.map(x => `<li>${x}</li>`).join("")}</ul></div>
      <div><b>不受影响</b><ul><li>账号与配对信息</li><li>其他资料库</li><li>${T.owBackupDesk}</li></ul></div></div>
    <div class="foot">${ui.btn("取消", { go: "daily" })}${ui.btn("下载并覆盖", { cls: "danger", go: "ow-running", then: "ow-done" })}</div></div></div>`;

  B.conn = s => {
    if (s === "unpaired") return page(wizardRole("conn"));
    if (s === "ow-confirm") return page(connSheet("daily"), owDialog());
    if (s === "ow-running") return page(connSheet("daily"), ui.dlgOverwrite("running"));
    return page(connSheet(s));
  };

  // 手机 B：整页向导；日常是一行状态 + 列表，覆盖进「高级与恢复」二级页
  const dots = at =>
    `<div style="display:flex;gap:6px;justify-content:center;margin:10px 0 22px">${[0, 1, 2].map(i => `<span style="width:${i === at ? 18 : 6}px;height:6px;border-radius:3px;background:var(--tau-${i === at ? "accent" : "line-1"})"></span>`).join("")}</div>`;
  const devicesArt =
    dashed => `<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin:8px 0 18px;color:var(--tau-ink-2)">
    <span class="m-tile" style="width:56px;height:56px;border-radius:18px">${icon("phone", "lg")}</span>
    <span style="width:60px;border-top:2px ${dashed ? "dashed" : "solid"} var(--tau-${dashed ? "line-1" : "ok"})"></span>
    <span class="m-tile" style="width:56px;height:56px;border-radius:18px;background:var(--tau-accent-soft);color:var(--tau-accent-text)">${icon("laptop", "lg")}</span></div>`;
  function mobileWizard() {
    return shell.phone({
      title: "连接电脑",
      body: `${dots(0)}${devicesArt(true)}<div style="text-align:center;padding:0 12px"><div style="font-size:22px;font-weight:600">连接你常用的电脑</div>
        <p style="color:var(--tau-ink-2);font-size:14.5px;line-height:1.65;margin:8px 0 22px">电脑上的 Tau 负责协调。手机连上后可以离线编辑，回到同一个局域网自动补齐。</p></div>
        <div class="m-group pad"><div class="m-steps">
          <div class="m-step"><span class="step-n">1</span><div><b>电脑：设置 → 同步 → 添加设备</b></div></div>
          <div class="m-step"><span class="step-n">2</span><div><b>复制配对信息，发到这台手机</b></div></div>
          <div class="m-step"><span class="step-n">3</span><div><b>回到这里粘贴</b><span>第一次会请求「本地网络」权限，选允许。</span></div></div></div></div>
        <p class="m-note" style="text-align:center">${T.firstCopy}</p>`,
      dock:
        ui.mbtn("粘贴配对信息", {
          cls: "primary",
          icon: "clipboard",
          go: "daily",
          toast: "已配对",
        }) + ui.mbtn("改用云端存储同步", { cls: "plain" }),
    });
  }
  function mobileDaily(s, overlay = "") {
    const d = ui.d();
    const offline = s === "offline";
    const status = offline
      ? `<div class="m-row"><span class="dot warn"></span><span class="grow">暂时连不上协调电脑<small>本机照常编辑 · 上次同步 09:12</small></span>${ui.mbtn("重试", { cls: "sm" })}</div>`
      : `<div class="m-row"><span class="dot ok"></span><span class="grow">已与协调电脑同步<small>刚刚补齐</small></span>${ui.mbtn("补齐", { cls: "sm", toast: "已补齐" })}</div>`;
    const why = offline
      ? `<p class="m-note">${T.offlineOk}检查手机和电脑是否在同一个 Wi‑Fi。</p>`
      : "";
    return shell.phone({
      body: `<div class="m-label">局域网设备同步</div><div class="m-group">${status}</div>${why}
        <div class="m-label">这台手机</div><div class="m-group">
          <div class="m-row"><span class="m-tile">${icon("database")}</span><span class="grow">本机资料库</span><span class="val">${d.replicaLibrary}</span></div>
          <div class="m-row"><span class="m-tile">${icon("laptop")}</span><span class="grow">协调电脑</span><span class="val">${d.coordinator}</span></div></div>
        <div class="m-group" style="margin-top:12px"><div class="m-row tap" data-go="adv"><span class="m-tile">${icon("shield")}</span><span class="grow">高级与恢复<small>重新配对、用电脑版本覆盖</small></span><span class="chev">${icon("chevR")}</span></div></div>
        <div class="m-label">另一种方式</div><div class="m-group"><div class="m-row tap"><span class="m-tile">${icon("cloud")}</span><span class="grow">云端存储同步</span><span class="val">未配置</span><span class="chev">${icon("chevR")}</span></div></div>`,
      overlay,
    });
  }
  function mobileAdv(overlay = "") {
    return shell.phone({
      title: "高级与恢复",
      body: `<div class="m-group" style="margin-top:6px"><div class="m-row tap"><span class="m-tile">${icon("link")}</span><span class="grow">重新粘贴配对信息<small>电脑换了网络地址时使用</small></span><span class="chev">${icon("chevR")}</span></div></div>
        <div class="m-label">恢复</div><div class="m-group"><div class="m-row tap danger" data-go="ow-confirm"><span class="m-tile" style="color:var(--tau-danger);background:var(--tau-danger-soft)">${icon("download")}</span><span class="grow">用电脑版本覆盖这台手机<small>丢弃手机上未同步的修改</small></span></div></div>
        <p class="m-note">暂停同步、解除这台手机的配对，在协调电脑的设置里操作。</p>`,
      overlay,
    });
  }
  const mDialog =
    () => `<div class="m-scrim"></div><div class="m-dialog"><h3>用电脑版本覆盖这台手机？</h3>
    <p>「${ui.d().replicaLibrary}」以协调电脑为准重新下载，手机上未同步的修改、草稿和撤销记录会被丢弃。${T.owKeep}。</p>
    <div style="display:grid;gap:8px;margin-top:14px">${ui.mbtn("下载并覆盖", { cls: "danger", go: "ow-running", then: "ow-done", thenToast: "已换成电脑上的版本" })}${ui.mbtn("取消", { cls: "plain", go: "adv" })}</div></div>`;
  B.mobile = s => {
    if (s === "unpaired") return mobileWizard();
    if (s === "adv") return mobileAdv();
    if (s === "ow-confirm") return mobileAdv(mDialog());
    if (s === "ow-running") return mobileAdv(ui.sheetOverwrite("running"));
    return mobileDaily(s);
  };

  B.notes = (view, s) =>
    ({
      "coord.unset": [
        "首次是带进度轨的三步向导，一次只问一件事",
        "角色是单选，选完才出现对应输入",
        "云端存储在同页下方并列，两种同步一眼可比",
      ],
      "coord.on": ["配对后整块收成一行状态条 + 一个主操作", "设备、高级与恢复默认收起，点开才看到"],
      "coord.pairing": ["添加设备复用向导第二步，左侧轨道告诉用户走到哪"],
      "conn.unpaired": ["连接端同一条向导，选「连接已有协调电脑」后直接出现粘贴框"],
      "conn.daily": [
        "日常只有一行；本机信息与覆盖都折在可展开段里",
        "覆盖最难被误触，但也最难找到",
      ],
      "conn.offline": ["状态条变黄，检查项紧跟在下面"],
      "conn.ow-confirm": ["宽对话框，「会丢弃 / 不受影响」两栏对照"],
      "mobile.unpaired": ["整页向导，插画表达「手机 ↔ 电脑」，主按钮在拇指区"],
      "mobile.daily": ["一行状态 + 列表；覆盖进入「高级与恢复」二级页"],
      "mobile.offline": ["状态行变黄，说明放在组下注记"],
      "mobile.ow-confirm": ["二级页里的居中确认框"],
    })[`${view}.${s}`] || [];
})();
