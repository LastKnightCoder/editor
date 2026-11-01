// 演示数据：全部为虚构值，不读取真实资料库，配对载荷不可用于真实配对
window.DEMO = {
  library: "工作笔记",
  code: "tau-pair:v1:演示数据-不可用于配对-eyJwcm90b2NvbCI6MiwiYWRkcmVzc2VzIjpbIjE5Mi4xNjguMS4yMyJdLCJwb3J0IjoyNDcyMX0",
  expiresAt: "14:37",
  // 现有接口：peers 只有 { id, name }；name 由连接端上报（桌面主机名，手机固定「我的手机」）
  now: {
    replicaLibrary: "device-7c1e2f04",
    coordinator: "协调电脑",
    peers: [
      { id: "p1", name: "Studio-iMac" },
      { id: "p2", name: "LAPTOP-8F2KQ" },
      { id: "p3", name: "我的手机" },
      { id: "p4", name: "我的手机" },
    ],
  },
  // 补充字段后：设备类型、最近连接时间、协调电脑名称、副本显示名
  plus: {
    replicaLibrary: "工作笔记",
    coordinator: "Xiong-MBP",
    peers: [
      { id: "p1", name: "Studio-iMac", kind: "monitor", seen: "刚刚连接" },
      { id: "p2", name: "ThinkPad X1", kind: "laptop", seen: "2 小时前" },
      { id: "p3", name: "iPhone 15", kind: "phone", seen: "刚刚连接" },
      { id: "p4", name: "Pixel 8", kind: "phone", seen: "3 天前" },
    ],
  },
};

const FULL = {
  coord: [
    ["unset", "未开启"],
    ["on", "已开启 · 多台设备"],
    ["pairing", "添加设备"],
    ["expired", "配对信息过期"],
    ["paused", "已暂停"],
    ["copies", "已保留冲突副本"],
    ["blocked", "不能开启"],
    ["revoke", "解除配对确认"],
  ],
  conn: [
    ["unpaired", "未配对"],
    ["invalid", "配对信息无效"],
    ["expiredPaste", "配对信息过期"],
    ["firstsync", "首次同步"],
    ["daily", "日常"],
    ["syncing", "立即补齐中"],
    ["offline", "离线等待补齐"],
    ["error", "同步失败"],
    ["paused", "已暂停"],
    ["assets", "图片待下载"],
    ["copies", "已保留冲突副本"],
    ["ow-confirm", "覆盖确认"],
    ["ow-running", "覆盖进行中"],
    ["ow-done", "覆盖完成"],
    ["ow-failed", "覆盖失败"],
  ],
  mobile: [
    ["unpaired", "未配对"],
    ["pasted", "已粘贴"],
    ["invalid", "配对信息无效"],
    ["expiredPaste", "配对信息过期"],
    ["firstsync", "首次同步"],
    ["daily", "日常"],
    ["offline", "离线等待补齐"],
    ["error", "同步失败"],
    ["assets", "图片待下载"],
    ["copies", "已保留冲突副本"],
    ["ow-confirm", "覆盖确认"],
    ["ow-running", "覆盖进行中"],
    ["ow-done", "覆盖完成"],
    ["ow-failed", "覆盖失败"],
  ],
};
const CORE = {
  coord: [
    ["unset", "未开启"],
    ["on", "已开启 · 多台设备"],
    ["pairing", "添加设备"],
  ],
  conn: [
    ["unpaired", "未配对"],
    ["daily", "日常"],
    ["offline", "离线等待补齐"],
    ["ow-confirm", "覆盖确认"],
  ],
  mobile: [
    ["unpaired", "未配对"],
    ["daily", "日常"],
    ["offline", "离线等待补齐"],
    ["ow-confirm", "覆盖确认"],
  ],
};

window.SCHEME_META = {
  A: {
    name: "一张纸 · 状态句",
    tagline:
      "设备同步独立成页签。一张大纸自上而下：一句状态 + 一个主操作 → 设备 / 本机 → 留白隔开的「恢复」区。配对引导就地展开在纸顶，完成即收起。",
    states: FULL,
  },
  B: {
    name: "首次向导 · 安静摘要",
    tagline:
      "首次使用是一条三步向导（选角色 → 交换配对信息 → 首次同步）；配对后整块收成一行状态条，设备与低频操作折进「设备」「高级与恢复」两个可展开段。云端存储同页并列在下方。",
    states: CORE,
  },
  C: {
    name: "关系图 · 弹窗配对",
    tagline:
      "左侧一张安静的关系图回答「谁连着谁」，右侧是状态与操作；配对走应用内弹窗向导，页面本身始终只有日常状态。覆盖收在协调电脑节点的菜单里。",
    states: CORE,
  },
};

// 每个状态的数据来源与依赖：src = 现有接口可直接驱动；need = 需补充的能力
window.NOTES = {
  "coord.unset": {
    src: [
      "<code>status.role = unpaired</code> 或 coordinator 且 <code>enabled = false</code>",
      "开启 → <code>device-sync:enable</code>；配对 → <code>device-sync:pair</code>",
    ],
  },
  "coord.on": {
    src: [
      "已配对数 = <code>peers.length</code>，只代表授权数，不代表在线",
      "「最近收到修改」= 协调端 <code>lastSync</code>（收到连接端提交时更新）",
      "暂停 → <code>pause</code>；解除 → <code>revoke(id)</code>",
    ],
    need: [
      "设备类型图标、每台设备最近连接时间：peers 需新增 <code>kind</code>、<code>lastSeen</code>（服务端在已授权请求时记录）",
      "手机名称固定为「我的手机」，多台手机会同名：需上报系统设备名或允许改名",
    ],
  },
  "coord.pairing": {
    src: [
      "<code>device-sync:pairing</code> 返回 <code>{ code, expires, addresses }</code>；5 分钟、一次性、每台设备一份",
      "重新生成会让上一份立即失效（服务端只保留一份）",
    ],
    need: ["「对方已配对」提示：现可由 peers 数量增加推断（3 秒轮询），无专门事件"],
  },
  "coord.expired": {
    src: [
      "过期判断用 <code>expires</code> 本地倒计时；服务端也会以 <code>DEVICE_SYNC_PAIR_EXPIRED</code> 拒绝",
    ],
  },
  "coord.paused": {
    src: ["<code>role = coordinator</code> 且 <code>enabled = false</code>；peers 记录保留"],
  },
  "coord.copies": {
    src: [
      "数量 = <code>branches + noteCopies</code>；列表 = <code>device-sync:copies</code> 的 <code>{ id, reason, kind }</code>",
      "保存 → <code>export-copy</code>（资料库另存 .db / 笔记导出原始材料）",
    ],
    need: [
      "reason 是技术描述（如「元数据事务已分叉」）：需要原因码 + 笔记标题 + 发生时间，界面才能写人话",
    ],
  },
  "coord.blocked": {
    src: ["<code>enable</code> 抛 <code>DEVICE_SYNC_SHARED_CONTENT</code>，按错误码映射说明"],
  },
  "coord.revoke": { src: ["<code>revoke(id)</code> 之后该设备不能再提交；对方已保存的资料保留"] },
  "conn.unpaired": {
    src: [
      "粘贴后 → <code>pair(code)</code>；首次建立独立 .db 并自动登记、切换",
      "同源重新配对保留本机未确认修改（<code>existing = true</code>）",
    ],
    need: ["粘贴即预览「来自哪台电脑 · 几点过期」：配对信息可在渲染端本地解码，不需协议改动"],
  },
  "conn.invalid": { src: ["<code>DEVICE_SYNC_PAIR</code>（格式无效）"] },
  "conn.expiredPaste": { src: ["<code>DEVICE_SYNC_PAIR_EXPIRED</code>"] },
  "conn.firstsync": { src: ["<code>pair()</code> 进行中；没有百分比，只用不确定进度"] },
  "conn.daily": {
    src: [
      "<code>phase = synced</code>、<code>lastSync</code>",
      "立即补齐 → <code>device-sync:sync</code>；暂停 → <code>pause</code>；恢复 → <code>enable</code>",
    ],
    need: [
      "协调电脑名称：<code>peer.json</code> 里有地址与主机名，但 status 未返回",
      "副本名为 <code>device-xxxx</code>：需要配对时记录协调端资料库显示名",
    ],
  },
  "conn.syncing": { src: ["<code>phase = syncing</code>，不确定进度"] },
  "conn.offline": {
    src: [
      "<code>phase = offline</code>（错误含 OFFLINE）；客户端自动退避 2 秒 → 1 分钟",
      "离线时覆盖不可用：下载需要连上协调电脑",
    ],
  },
  "conn.error": {
    src: [
      "<code>phase = error</code> + <code>error</code> 字符串；按 <code>DEVICE_SYNC_SCHEMA / UNTRUSTED / BUDGET …</code> 前缀映射说明",
    ],
    need: ["status 返回结构化错误码，避免界面解析字符串"],
  },
  "conn.assets": { src: ["<code>pendingAssets</code> 数量；正文先确认，附件独立重试"] },
  "conn.copies": { src: ["同协调端：<code>branches / noteCopies / copies / export-copy</code>"] },
  "conn.ow-confirm": {
    src: [
      "<code>device-sync:download</code>；要求 client 已连接当前库",
      "旧库先复制到 backup，失败恢复原库连接",
    ],
  },
  "conn.ow-running": { src: ["下载、校验、安装没有分阶段事件：只显示不确定进度"] },
  "conn.ow-done": {
    src: ["桌面完成后重新加载持有该库的窗口"],
    need: ["完成提示要跨窗口重载保留：主进程在重载后发一次性「覆盖已完成」通知"],
  },
  "conn.ow-failed": { src: ["download 抛错；原库连接已恢复，可继续编辑"] },
  "mobile.unpaired": {
    src: [
      "<code>phase = idle</code> 且未登记；粘贴 → <code>pairDevice(code)</code>",
      "读取剪贴板沿用加入协作页的做法（<code>clipboard.readText</code>）",
    ],
  },
  "mobile.pasted": { src: ["本机名称当前固定为「我的手机」"], need: ["配对前改名或取系统设备名"] },
  "mobile.invalid": { src: ["原生返回 <code>DEVICE_SYNC_PAIR</code>"] },
  "mobile.expiredPaste": { src: ["<code>DEVICE_SYNC_PAIR_EXPIRED</code>"] },
  "mobile.firstsync": { src: ["<code>pairDevice</code> 进行中：<code>phase = syncing</code>"] },
  "mobile.daily": {
    src: [
      "<code>phase / lastSync</code>；立即补齐 → <code>wakeDeviceSync()</code>",
      "移动端没有暂停、解除配对与设备列表接口：只展示连接情况",
    ],
  },
  "mobile.offline": { src: ["<code>phase = offline</code>；回到前台与重新联网时自动对账"] },
  "mobile.error": { src: ["<code>phase = error</code> + <code>error</code>"] },
  "mobile.assets": { src: ["<code>pendingAssets</code>"] },
  "mobile.copies": { src: ["只有数量 <code>preservedCopies</code>；查看与导出在电脑端"] },
  "mobile.ow-confirm": {
    src: ["<code>downloadDeviceLibrary()</code>：串行等待在途操作、暂停编辑与正常同步"],
    need: ["当前移动端点击即执行、没有确认：本方案补一次应用内确认（纯 UI）"],
  },
  "mobile.ow-running": { src: ["<code>phase = syncing</code>，不确定进度"] },
  "mobile.ow-done": { src: ["<code>phase = synced</code>、<code>preservedCopies</code> 归零"] },
  "mobile.ow-failed": { src: ["download 抛错；编辑门禁已解除"] },
};
