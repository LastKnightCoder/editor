// 方案 A · 手机：同一语言的竖排版——状态卡在上、拇指区放唯一主按钮；覆盖在「恢复」组，经底部面板确认一次
(() => {
  const A = (window.schemeA = window.schemeA || {});
  const T = ui.T;
  const cloudRow = `<div class="m-label">另一种方式</div><div class="m-group"><div class="m-row tap"><span class="m-tile">${icon("cloud")}</span>
    <span class="grow">云端存储同步<small>经你自己的存储服务，不需要同一局域网</small></span><span class="val">未配置</span><span class="chev">${icon("chevR")}</span></div></div>`;
  const label = t => `<div class="m-label">${t}</div>`;
  const phone = (body, dock = "", overlay = "") => shell.phone({ body, dock, overlay });

  function unpaired(s) {
    const steps = `<div class="m-steps">
      <div class="m-step"><span class="step-n">1</span><div><b>在电脑上打开同步设置</b><span>设置 → 同步 → 设备同步。还没开启时，选「由本机协调」。</span></div></div>
      <div class="m-step"><span class="step-n">2</span><div><b>点「添加设备」，复制配对信息</b><span>经隔空投送、备忘录或自己的聊天工具发到这台手机。</span></div></div>
      <div class="m-step"><span class="step-n">3</span><div><b>回到这里粘贴</b><span>第一次会请求「本地网络」权限，选允许。</span></div></div></div>`;
    const head = `${label("局域网设备同步")}<div class="m-group pad">${ui.mstatus({ tone: "accent", ic: "link", t: "连接你常用的电脑", s: "电脑上的 Tau 负责协调。连上后手机可离线编辑，回到同一个局域网自动补齐。" })}</div>`;
    if (s === "pasted" || s === "invalid" || s === "expiredPaste") {
      const msg =
        s === "invalid"
          ? ui.mstatus({
              tone: "danger",
              ic: "alert",
              t: "配对信息不完整",
              s: "请在电脑上重新复制，整段粘贴。",
            })
          : s === "expiredPaste"
            ? ui.mstatus({
                tone: "warn",
                ic: "clock",
                t: "配对信息已过期",
                s: "配对信息 5 分钟内有效。请在电脑上点「添加设备」重新生成。",
              })
            : ui.mstatus({
                tone: "accent",
                ic: "clipboard",
                t: "配对信息已就绪",
                s: `<span class="mono" style="font-size:12px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${DEMO.code}</span>`,
              });
      const body = `${label("局域网设备同步")}<div class="m-group pad">${msg}</div>
        ${
          s === "pasted"
            ? `<div class="m-group" style="margin-top:12px"><div class="m-row"><span class="m-tile">${icon("phone")}</span><span class="grow">在电脑上显示为<small>${STATE.api === "plus" ? "取自系统设备名" : "当前固定名称"}</small></span><span class="val">${STATE.api === "plus" ? "iPhone 15" : "我的手机"}</span></div></div>
        <p class="m-note">${T.firstCopy}${T.rePair}</p>`
            : ""
        }${cloudRow}`;
      const dock =
        s === "pasted"
          ? ui.mbtn("配对", {
              cls: "primary",
              go: "firstsync",
              then: "assets",
              thenToast: "已配对",
            }) + ui.mbtn("重新粘贴", { cls: "plain", go: "unpaired" })
          : ui.mbtn("重新粘贴", { cls: "primary", icon: "clipboard", go: "pasted" });
      return phone(body, dock);
    }
    const clip = `<div class="m-clip" style="margin-top:12px">${icon("clipboard", "lg")}<div class="grow">剪贴板里有配对信息<small>${DEMO.code}</small></div></div>`;
    return phone(
      `${head}<div class="m-label">怎么连接</div><div class="m-group pad">${steps}</div>${clip}<p class="m-note">${T.firstCopy}</p>${cloudRow}`,
      ui.mbtn("粘贴配对信息", { cls: "primary", icon: "clipboard", go: "pasted" })
    );
  }

  function connected(s) {
    const d = ui.d();
    const sync = ui.mbtn("立即补齐", {
      cls: "sm",
      icon: "refresh",
      go: "m-syncing",
      then: s === "offline" ? "offline" : "daily",
      thenToast: s === "offline" ? undefined : "已补齐",
    });
    const status =
      {
        firstsync: ui.mstatus({
          tone: "accent",
          ic: "refresh",
          spin: true,
          t: "正在建立本机副本",
          s: `从电脑下载「${DEMO.library}」。请让 Tau 留在前台，切走后会在回来时继续。`,
        }),
        "m-syncing": ui.mstatus({
          tone: "accent",
          ic: "refresh",
          spin: true,
          t: "正在补齐…",
          s: "合并电脑和手机的修改，正文都会保留。",
        }),
        offline: ui.mstatus({
          tone: "warn",
          ic: "wifiOff",
          t: "暂时连不上协调电脑",
          s: `${T.offlineOk}上次同步 今天 09:12。`,
        }),
        error: ui.mstatus({
          tone: "danger",
          ic: "alert",
          t: "这次同步没有完成",
          s: "已保存的内容不受影响，可以继续编辑。回到前台或重新联网时会再试。",
        }),
        assets: ui.mstatus({
          tone: "ok",
          ic: "checkCircle",
          t: "正文已同步，图片还在下载",
          s: "12 张图片稍后显示，不影响阅读和编辑。",
        }),
      }[s] ||
      ui.mstatus({
        tone: "ok",
        ic: "checkCircle",
        t: "已与协调电脑同步",
        s: "刚刚补齐 · 打开 Tau、回到前台或重新联网时自动补齐。",
      });
    let extra = "";
    if (s === "firstsync") extra = `<div class="indet" style="margin-top:16px"></div>`;
    else if (s === "error")
      extra = `<div class="m-sub"><b style="color:var(--tau-ink-1)">原因</b>　这台手机的配对已在电脑上解除。重新粘贴配对信息即可，手机上的修改会保留。</div>`;
    else if (s === "offline")
      extra = `<div class="m-sub">检查手机和电脑是否在同一个 Wi‑Fi、电脑上的 Tau 是否开着。</div>`;
    if (!["firstsync", "m-syncing"].includes(s))
      extra += `<div style="display:flex;gap:8px;margin-top:14px">${s === "error" ? ui.mbtn("重新粘贴配对信息", { cls: "sm", go: "pasted" }) : sync}</div>`;
    let quiet = "";
    if (s === "assets")
      quiet = `<div class="m-group" style="margin-top:12px"><div class="m-row"><span class="m-tile">${icon("image")}</span><span class="grow">12 张图片待下载<small>自动重试，部分下载的文件不会被当作完成</small></span></div></div>`;
    if (s === "copies")
      quiet = `<div class="m-group" style="margin-top:12px"><div class="m-row"><span class="m-tile">${icon("files")}</span><span class="grow">已保留 2 份冲突副本<small>可在协调电脑的同步设置里查看；日常同步不受影响</small></span></div></div>`;
    if (s === "ow-done")
      quiet = `<div class="m-group" style="margin-top:12px"><div class="m-row"><span class="m-tile">${icon("history")}</span><span class="grow">已换成电脑上的版本<small>刚刚 · 撤销记录与草稿已清空</small></span></div></div>`;
    if (s === "firstsync")
      return `${label("局域网设备同步")}<div class="m-group pad">${status}${extra}</div><p class="m-note">现有资料库保持原样。</p>`;
    const offline = s === "offline";
    const body = `${label("局域网设备同步")}<div class="m-group pad">${status}${extra}</div>${quiet}
      ${label("这台手机")}<div class="m-group">
        <div class="m-row"><span class="m-tile">${icon("database")}</span><span class="grow">本机资料库</span><span class="val">${d.replicaLibrary}</span></div>
        <div class="m-row"><span class="m-tile">${icon("laptop")}</span><span class="grow">协调电脑</span><span class="val">${d.coordinator}</span></div></div>
      ${label("恢复")}<div class="m-group"><div class="m-row tap danger" data-go="${offline ? "" : "ow-confirm"}" style="${offline ? "opacity:.45" : ""}">
        <span class="m-tile" style="color:var(--tau-danger);background:var(--tau-danger-soft)">${icon("download")}</span>
        <span class="grow">用电脑版本覆盖这台手机<small>${offline ? "连上协调电脑后才能使用" : "手机上的资料明显不对时才需要"}</small></span><span class="chev">${icon("chevR")}</span></div></div>
      ${label("更多")}<div class="m-group"><div class="m-row tap" data-go="pasted"><span class="m-tile">${icon("link")}</span><span class="grow">重新粘贴配对信息<small>电脑换了网络地址时使用，修改都会保留</small></span><span class="chev">${icon("chevR")}</span></div></div>
      <p class="m-note">暂停同步、解除这台手机的配对，在协调电脑的设置里操作。</p>${cloudRow}`;
    return body;
  }
  A.mobileBody = connected;

  A.mobile = s => {
    if (["unpaired", "pasted", "invalid", "expiredPaste"].includes(s)) return unpaired(s);
    // 覆盖面板盖在日常页上
    if (["ow-confirm", "ow-running", "ow-failed"].includes(s))
      return phone(connected("daily"), "", ui.sheetOverwrite(s.slice(3)));
    return phone(connected(s));
  };

  A.mobileNotes = s =>
    ({
      unpaired: [
        "三步说明在上，「粘贴配对信息」固定在拇指区",
        "检测到剪贴板里有配对信息时给一张淡色提示，不自动配对",
        "云端存储同步作为「另一种方式」放在最下，与设备同步分开",
      ],
      pasted: ["粘贴后只显示载荷开头，告诉用户这台手机在电脑上叫什么"],
      daily: [
        "日常只有一张状态卡 +「立即补齐」；手机没有暂停与解除接口，所以不放这些按钮，只写去哪里操作",
        "覆盖是「恢复」组里的一行红字，点进去才出确认面板",
      ],
      offline: ["黄色状态 + 下一步检查项；覆盖行置灰并写明原因"],
      error: ["授权被撤销时，下一步直接给「重新粘贴配对信息」"],
      assets: ["图片待下载是一行补充，不改变主状态的绿色"],
      copies: ["手机只有副本数量：说明去电脑上查看"],
      "ow-confirm": ["底部面板，危险按钮在拇指区；一次确认"],
      "ow-running": ["面板锁住，按钮转圈；提醒留在前台"],
      "ow-done": ["关掉面板，toast + 一行「已换成电脑上的版本」"],
      "ow-failed": ["失败明说手机上的资料保持原样，可以继续编辑"],
      firstsync: ["不确定进度 + 提醒留在前台：iOS 切后台会挂起"],
    })[s] || [];
})();
