// 方案 A · 桌面：设备同步独立页签，一整张纸——状态句 → 设备 / 本机 → 留白隔开的「恢复」
(() => {
  const A = (window.schemeA = window.schemeA || {});
  const T = ui.T;
  const TABS = [["设备同步", true], ["云端存储"], ["资源文件"], ["本地数据库"]];
  const page = (body, overlay = "") => shell.desktop({ body, overlay, tabs: TABS });
  const warnNote = (ic, text, color = "warn") =>
    `<div class="note" style="color:var(--tau-${color})">${icon(ic)}<span>${text}</span></div>`;

  // 角色选择：协调端「未开启」与连接端「未配对」是同一张纸，按视角决定主按钮落在哪一侧
  function roles(view, s) {
    const pasted =
      {
        unpaired: DEMO.code,
        invalid: "tau-pair:v1:演示数据-eyJwcm90b2NvbCI6",
        expiredPaste: DEMO.code,
      }[s] || "";
    const err =
      s === "invalid"
        ? warnNote("alert", "这段配对信息不完整。请在协调电脑上重新复制，整段粘贴。", "danger")
        : s === "expiredPaste"
          ? warnNote(
              "clock",
              "配对信息已过期（5 分钟内有效）。请在协调电脑上点「添加设备」重新生成。"
            )
          : "";
    const blocked =
      s === "blocked"
        ? warnNote(
            "alert",
            "这份资料库里有正在云端共享的正文，不能同时开启设备同步。先结束共享，再回来开启。",
            "danger"
          )
        : "";
    const coordFocus = view === "coord";
    return `<section class="sheet">
      <div class="intro"><span class="badge">${icon("database", "sm")}当前资料库 · ${DEMO.library}</span>
        <h2>让这份资料库在你的设备之间自动同步</h2>
        <p>一台电脑负责协调，其他电脑和手机连接它。每台设备都能离线编辑，回到同一个局域网后自动补齐。</p></div>
      <div class="roles">
        <div class="role ${coordFocus ? "on" : ""}">
          <div class="role-h"><span class="role-i">${icon("hub", "lg")}</span><b>由本机协调</b></div>
          <p>这台电脑资料最完整、平时常开着，就选它。开启后为每台设备生成一份配对信息。</p>
          ${blocked}
          <div class="role-f">${ui.btn("开启并协调", { cls: coordFocus ? "primary" : "", go: coordFocus ? "fresh" : "coord:fresh" })}</div>
        </div>
        <div class="role ${coordFocus ? "" : "on"}">
          <div class="role-h"><span class="role-i">${icon("link", "lg")}</span><b>连接已有协调电脑</b></div>
          <p>在协调电脑的「设置 → 同步 → 添加设备」复制配对信息，粘贴到这里。</p>
          <textarea class="paste ${s === "invalid" ? "bad" : ""}" rows="2" placeholder="粘贴以 tau-pair: 开头的配对信息">${pasted}</textarea>
          ${err}
          <div class="role-f">${ui.btn("配对并建立本机副本", { cls: !coordFocus && pasted && !err ? "primary" : "", disabled: !pasted || !!err, go: coordFocus ? "conn:firstsync" : "firstsync", then: "assets", thenToast: "已配对，正文已同步" })}
            <span class="muted">${T.firstCopy}</span></div>
        </div>
      </div>
      <div class="foot-cols" style="margin-top:22px"><div><b>同步什么</b>${T.scope}</div><div><b>先想好哪台电脑协调</b>${T.coordOnly}${T.notAllOnline}</div></div>
    </section>`;
  }

  const peerRow = p => `<div class="peer"><span class="pi">${icon(ui.peerIcon(p))}</span>
    <span class="pn"><b>${p.name}</b><small>${ui.peerSub(p)}</small></span>
    ${ui.ibtn("more", { menu: `peer-${p.id}`, label: "设备操作" })}
    ${ui.menu(`peer-${p.id}`, [{ label: "解除配对", sub: "之后不能再与本机同步", icon: "unlink", danger: true, go: "revoke" }], "right:6px;top:42px")}</div>`;

  function pairPanel(expired) {
    const meta = expired
      ? `<span style="color:var(--tau-warn)">${icon("clock", "sm")} 已过期。重新生成一份即可，之前那份不能再用。</span><span class="end">${ui.btn("重新生成", { cls: "sm primary", icon: "refresh", go: "pairing", toast: "已生成新的配对信息" })}</span>`
      : `<span>${icon("clock", "sm")} ${DEMO.expiresAt} 前有效</span><span class="waiting"><span class="ring-spin"></span>等待那台设备配对…</span><span class="end">${ui.btn("重新生成", { cls: "sm ghost", go: "pairing", toast: "已生成新的配对信息，之前那份已失效" })}</span>`;
    return `<div class="pair">
      <div class="pair-h"><b>添加一台设备</b><span class="muted">每份配对信息只给一台设备，只发给你自己的设备</span></div>
      <ol class="pair-steps">
        <li><span class="step-n">1</span><div><b>在那台设备打开同步设置</b><span>电脑：设置 → 同步 → 设备同步<br>手机：设置 → 同步</span></div></li>
        <li><span class="step-n">2</span><div><b>复制下面的配对信息</b><span>经隔空投送、备忘录或自己的聊天工具发过去</span></div></li>
        <li><span class="step-n">3</span><div><b>在那台设备粘贴并配对</b><span>完成后这里会自动收起，设备出现在列表里</span></div></li>
      </ol>
      ${ui.code(expired)}
      <div class="pair-meta">${meta}</div></div>`;
  }

  function coordOn(s) {
    const d = ui.d();
    const fresh = s === "fresh",
      paused = s === "paused",
      pairing = ["pairing", "expired", "fresh"].includes(s);
    const band = paused
      ? ui.band({
          tone: "",
          ic: "pause",
          t: "局域网连接已暂停",
          s: `${d.peers.length} 台已配对设备暂时连不上本机，各自仍可编辑；恢复后自动补齐。`,
          acts: ui.btn("恢复连接", {
            cls: "primary",
            icon: "play",
            go: "on",
            toast: "已恢复局域网连接",
          }),
        })
      : ui.band({
          tone: "ok",
          ic: "hub",
          t: `本机正在协调「${DEMO.library}」`,
          s: fresh
            ? "还没有配对的设备，先添加一台"
            : `已配对 ${d.peers.length} 台设备 · 最近收到修改 3 分钟前`,
          acts:
            (pairing
              ? ui.btn("收起", { cls: "ghost", go: fresh ? "fresh" : "on", disabled: fresh })
              : ui.btn("添加设备", { cls: "primary", icon: "plus", go: "pairing" })) +
            ui.ibtn("more", { menu: "coord-more" }) +
            ui.menu("coord-more", [
              {
                label: "暂停局域网连接",
                sub: "其他设备暂时连不上，各自仍可编辑",
                icon: "pause",
                go: "paused",
              },
            ]),
        });
    const copies =
      s === "copies"
        ? `<div class="quiet-row">${icon("files")}<span>已保留 2 份冲突副本，日常同步继续使用当前资料库</span><span class="end">${ui.btn("查看", { cls: "sm ghost", go: "copies-open" })}</span></div>`
        : "";
    const list = fresh
      ? ""
      : `<div class="sec"><div class="sec-h"><h4>已配对的设备</h4><span>${d.peers.length} 台 · 不必同时在线</span></div>
      <div class="peers ${paused ? "dim" : ""}"><div class="peer self"><span class="pi">${icon("laptop")}</span><span class="pn"><b>这台电脑</b><small>协调中</small></span></div>${d.peers.map(peerRow).join("")}</div></div>`;
    return `<section class="sheet">${band}${copies}${pairing ? pairPanel(s === "expired") : ""}${list}
      <div class="sec foot-cols" style="margin-top:30px"><div><b>同步什么</b>${T.scope}</div><div><b>设备连不上时</b><ul>${T.troubleshoot
        .slice(0, 2)
        .map(x => `<li>${x}</li>`)
        .join("")}<li>检查防火墙是否放行 Tau</li></ul></div></div></section>`;
  }
  // 冲突副本：低干扰入口，点开才看到；日常不让用户选库
  const copiesDialog = back => {
    const plus = STATE.api === "plus";
    const rows = [
      plus
        ? [
            "note",
            "《周会纪要》· 昨天 21:40",
            "那篇笔记在协调电脑上被删除，这台设备的离线输入另存了一份",
          ]
        : ["note", "正文已删除，离线输入已保留为笔记副本", "笔记副本"],
      plus
        ? [
            "library",
            "整库副本 · 10 月 12 日",
            "两台设备离线时改了同一个标题或标签，保留了改动前的完整资料库",
          ]
        : ["library", "元数据事务已分叉", "资料库副本"],
    ];
    return `<div class="scrim"><div class="dialog lg"><h3>已保留的冲突副本</h3>
      <p>少数离线修改无法自动合并时，Tau 会把它们完整留下来。日常同步继续使用当前资料库，你可以另存一份对照查看。</p>
      <div class="copies">${rows.map(([k, t, sub]) => `<div class="peer"><span class="pi">${icon(k === "note" ? "files" : "database")}</span><span class="pn"><b>${t}</b><small>${sub}</small></span>${ui.btn(k === "note" ? "导出原始材料" : "另存为资料库", { cls: "sm", toast: "已在访达中显示（演示）" })}</div>`).join("")}</div>
      <div class="foot">${ui.btn("关闭", { go: back })}</div></div></div>`;
  };
  const revokeDialog =
    () => `<div class="scrim"><div class="dialog"><h3>解除这台设备的配对</h3><span class="ctx badge">LAPTOP-8F2KQ</span>
    <p>解除后它不能再与本机同步。它上面已经保存的资料不会被删除；以后想恢复，重新添加一次即可。</p>
    <div class="foot">${ui.btn("取消", { go: "on" })}${ui.btn("解除配对", { cls: "danger", act: "revoke-confirm" })}</div></div></div>`;
  const rePairDialog = () => `<div class="scrim"><div class="dialog"><h3>重新粘贴配对信息</h3>
    <p>协调电脑换了网络地址，或者本机的配对被解除时使用。连接的还是同一份资料库，本机的离线修改都会保留。</p>
    <textarea class="paste" rows="3" placeholder="粘贴以 tau-pair: 开头的配对信息">${DEMO.code}</textarea>
    <div class="foot">${ui.btn("取消", { go: "daily" })}${ui.btn("重新配对", { cls: "primary", go: "syncing", then: "daily", thenToast: "已重新配对，离线修改已补齐" })}</div></div></div>`;

  A.coord = s => {
    if (["unset", "blocked"].includes(s)) return page(roles("coord", s));
    if (s === "revoke") return page(coordOn("on"), revokeDialog());
    if (s === "copies-open") return page(coordOn("copies"), copiesDialog("copies"));
    return page(coordOn(s));
  };

  function recovery(disabled) {
    return `<div class="sec" style="margin-top:40px"><div class="sec-h"><h4>恢复</h4></div>
      <div class="rec-row"><div><b>下载协调电脑版本并覆盖本机</b>
        <span>本机资料明显不对、想完全回到协调电脑的状态时才需要。会丢弃这台电脑上未同步的修改。</span>
        ${disabled ? `<span class="muted">${icon("info", "sm")} 连上协调电脑后才能下载</span>` : ""}</div>
        ${ui.btn("下载并覆盖…", { cls: "danger-soft", icon: "download", go: "ow-confirm", disabled })}</div></div>`;
  }
  function connSheet(s) {
    const d = ui.d();
    const more =
      ui.ibtn("more", { menu: "conn-more" }) +
      ui.menu("conn-more", [
        { label: "暂停自动连接", sub: "本机照常编辑，恢复后补齐", icon: "pause", go: "paused" },
        { label: "重新粘贴配对信息", sub: "协调电脑换了地址时使用", icon: "link", go: "re-pair" },
      ]);
    const sync = (cls = "") =>
      ui.btn("立即补齐", {
        cls,
        icon: "refresh",
        go: "syncing",
        then: "daily",
        thenToast: "已补齐",
      });
    let band,
      extra = "";
    switch (s) {
      case "firstsync":
        band = ui.band({
          tone: "accent",
          ic: "refresh",
          spin: true,
          t: "正在建立本机副本",
          s: `从协调电脑下载「${DEMO.library}」，资料较多时需要几分钟。现有资料库保持原样。`,
        });
        extra = `<div class="indet" style="margin:16px 0 0 50px"></div>`;
        break;
      case "syncing":
        band = ui.band({
          tone: "accent",
          ic: "refresh",
          spin: true,
          t: "正在补齐…",
          s: "合并协调电脑和本机的修改，正文都会保留",
          acts: more,
        });
        break;
      case "offline":
        band = ui.band({
          tone: "warn",
          ic: "wifiOff",
          t: "暂时连不上协调电脑",
          s: `${T.offlineOk}上次同步 今天 09:12。`,
          acts: ui.btn("重试", { icon: "refresh", go: "syncing", then: "offline" }) + more,
        });
        extra = `<div class="reason"><b>可以检查</b><ul style="margin:4px 0 0;padding-left:16px">${T.troubleshoot.map(x => `<li>${x}</li>`).join("")}</ul></div>`;
        break;
      case "error":
        band = ui.band({
          tone: "danger",
          ic: "alert",
          t: "这次同步没有完成",
          s: "已保存的内容不受影响，可以继续编辑。Tau 会自动重试，间隔逐渐拉长到每分钟一次。",
          acts:
            ui.btn("重试", { icon: "refresh", go: "syncing", then: "daily", thenToast: "已补齐" }) +
            more,
        });
        extra = `<div class="reason"><b>原因</b>　两台设备的 Tau 版本不一致。先把两边都更新到最新版本，再重试。${ui.btn("复制错误详情", { cls: "sm ghost", toast: "已复制错误详情" })}</div>`;
        break;
      case "paused":
        band = ui.band({
          tone: "",
          ic: "pause",
          t: "已暂停自动连接",
          s: "本机照常编辑，修改都保存在这台电脑上；恢复后自动补齐。",
          acts: ui.btn("恢复自动连接", {
            cls: "primary",
            icon: "play",
            go: "syncing",
            then: "daily",
            thenToast: "已恢复并补齐",
          }),
        });
        break;
      default:
        band = ui.band({
          tone: "ok",
          ic: "checkCircle",
          t: s === "assets" ? "正文已同步，图片还在下载" : "已与协调电脑同步",
          s:
            s === "assets"
              ? "12 张图片稍后显示，不影响阅读和编辑；网络恢复后会继续下载。"
              : `刚刚补齐 · ${T.notAllOnline}`,
          acts: sync() + more,
        });
    }
    if (s === "assets")
      extra = `<div class="quiet-row">${icon("image")}<span class="num">12 张图片待下载</span><span class="end muted">自动重试中</span></div>`;
    if (s === "copies")
      extra = `<div class="quiet-row">${icon("files")}<span>已保留 2 份冲突副本，日常同步继续使用当前资料库</span><span class="end">${ui.btn("查看", { cls: "sm ghost", go: "copies-open" })}</span></div>`;
    if (s === "ow-done")
      extra = `<div class="quiet-row">${icon("history")}<span>已换成协调电脑的版本 · 原资料库备份在 backup 文件夹</span></div>`;
    const facts =
      s === "firstsync"
        ? ""
        : `<div class="sec"><div class="facts">
      <div><div class="k">本机资料库</div><div class="v">${d.replicaLibrary}<small>配对时新建的本机副本</small></div></div>
      <div><div class="k">协调电脑</div><div class="v">${d.coordinator}<small>同一局域网</small></div></div>
      <div><div class="k">自动补齐</div><div class="v">打开、唤醒、切回窗口时<small>${STATE.api === "plus" ? "失败后最长每分钟重试" : "失败后自动重试"}</small></div></div></div></div>`;
    return `<section class="sheet">${band}${extra}${facts}${s === "firstsync" ? "" : recovery(s === "offline" || s === "paused")}</section>`;
  }
  A.conn = s => {
    if (["unpaired", "invalid", "expiredPaste"].includes(s)) return page(roles("conn", s));
    if (s === "ow-confirm") return page(connSheet("daily"), ui.dlgOverwrite("confirm"));
    if (s === "ow-running") return page(connSheet("daily"), ui.dlgOverwrite("running"));
    if (s === "ow-failed") return page(connSheet("daily"), ui.dlgOverwrite("failed"));
    if (s === "copies-open") return page(connSheet("copies"), copiesDialog("copies"));
    if (s === "re-pair") return page(connSheet("daily"), rePairDialog());
    return page(connSheet(s));
  };

  A.notes = (view, s) => {
    if (view === "mobile") return A.mobileNotes?.(s) || [];
    const n = {
      unset: [
        "协调与连接是同一张纸上的两条路：两者都要先选好，不藏在下一步",
        "顶部徽标写明「当前资料库」：设备同步按库开启，不是全局开关",
      ],
      on: [
        "状态句 + 一个主操作（添加设备）；暂停收进 ⋯",
        "设备是两列行式列表，不做卡片；每台只有一个固定位置的 ⋯",
        "副标题写「已配对」而不是「在线」：现有接口不知道谁在线",
      ],
      pairing: [
        "配对引导就地展开在状态句下方，步骤说明在上、配对信息在下",
        "长载荷单行省略，「复制」是唯一主按钮；配对完成后自动收起",
      ],
      expired: ["过期后载荷划掉、复制按钮消失，主操作换成「重新生成」"],
      paused: ["暂停后设备列表降淡保留，主操作换成「恢复连接」"],
      copies: ["冲突副本是一行淡底提示 +「查看」，不打断日常"],
      fresh: ["刚开启、还没有设备时直接展开配对引导"],
      daily: [
        "日常只剩一句状态 +「立即补齐」；暂停、重新配对收进 ⋯",
        "「恢复」区与日常操作隔开一段留白，按钮用 danger-soft，点开再确认一次",
      ],
      offline: ["黄色而非红色：离线是常态，不是故障", "覆盖按钮置灰并说明原因：离线时下载必然失败"],
      error: ["原因用人话，并给出下一步；原始错误只在「复制错误详情」里"],
      firstsync: ["没有百分比：只用不确定进度，并写明现有资料库不受影响"],
      assets: ["主句仍是绿色「已同步」，图片是补充说明，不升级为警告"],
      "ow-confirm": ["一次确认：徽标写明是哪份资料库，列出会丢什么、什么不受影响"],
      "ow-running": ["对话框锁住，进度不确定；只说明「这份资料库暂停编辑」"],
      "ow-done": ["完成后整窗短暂过渡「正在重新打开」，回来后 toast + 一行备份位置"],
      "ow-failed": ["失败明说「已恢复原样，可以继续编辑」，再给重试"],
    };
    return (
      n[s] ||
      n[
        {
          invalid: "unset",
          expiredPaste: "unset",
          unpaired: "unset",
          blocked: "unset",
          syncing: "daily",
          revoke: "on",
          "re-pair": "daily",
          "copies-open": "copies",
        }[s]
      ] ||
      []
    );
  };
})();
