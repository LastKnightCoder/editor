# 产品埋点系统（Umami 自托管）

> 迁移说明（2026-10-18）：当前源码已切换至独立的 Workers + D1 方案，见 [Analytics 设计](../apps/analytics/docs/DESIGN.md) 与 [部署说明](../apps/analytics/README.md)。本文保留为旧版本客户端及旧部署的维护资料；新服务须先部署，再发布官网/桌面版本，旧 Umami 不在本次代码修改中停用。

> 2026-10 搭建。自托管 Umami v3 承载桌面端匿名使用统计（访问人数 / 常用功能 / 使用时长）。
> 本文是整个系统的参考文档：服务端部署信息、看板（Boards）数据格式与搭建方法、客户端事件口径。
> **管理员密码不写入仓库文档**，由管理员持有；忘记时需登录服务器通过数据库或官方方式重置。

## 1. 系统概览

```
桌面客户端(打包构建) ──POST──▶ https://stats.taunote.app/api/send
                                    │
                       ECS (101.133.166.30, cn-shanghai)
                       nginx (80→443, Let's Encrypt 自动续期)
                                    │ 127.0.0.1:3000
                       docker: umami + postgres15 (/opt/tau/umami)
```

| 项              | 值                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------- |
| 管理后台        | <https://stats.taunote.app>（账号 `admin`）                                                       |
| 网站（website） | Tau Desktop，id `ae1b3d6f-0972-48ec-afb6-f1a8b7a79bd2`                                            |
| 服务器部署目录  | `/opt/tau/umami/`（docker-compose.yml + .env，数据在 `./data`）                                   |
| nginx 配置      | `/etc/nginx/conf.d/stats.xiongtao.life.conf`（webroot 模式证书，与 api/collab 站点同套）          |
| 客户端常量      | `apps/desktop/src-electron/main/modules/telemetry.ts` 的 `UMAMI_WEBSITE_ID`（置空即整体停用上报） |

服务器内存仅 1.8G：Umami 全套占用约 260MB，勿再在此机器跑 ClickHouse 类重型分析栈（PostHog/Aptabase 自托管都不行）。

国内 ECS 拉不动 Docker Hub 时的取镜像路径：本地（或任意有网环境）经加速源按 **digest** 拉指定架构镜像 → `docker save | gzip` → `rsync --partial --inplace` 断点续传 → 服务器 `docker load`。注意加速源（rat.dev/1panel 等）透传时按客户端架构返回 manifest，`--platform linux/amd64` 可能失效，须先 `docker manifest inspect` 拿 amd64 digest 再按 digest 拉。

## 2. API 认证

```bash
TOKEN=$(curl -s -X POST https://stats.taunote.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<密码>"}' | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
# 之后所有请求带 -H "Authorization: Bearer $TOKEN"
```

注意：Umami 修改用户密码的端点是 **POST** `/api/users/<userId>`（PUT/PATCH 均 405）。

## 3. v3 Boards 体系（重要概念）

Umami v3 起仪表盘完全组件化，有两类载体：

| 载体          | 说明                                                                             | API                                   |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| **dashboard** | 网站详情页的那个仪表盘，每用户一份，全实例只有一条                               | `GET` / `POST` `/api/dashboard`       |
| **board**     | 「Boards」菜单里可自建多个的看板，type 为 `mixed` / `website` / `pixel` / `link` | CRUD `/api/boards`、`/api/boards/:id` |

新装的实例两者默认都是空白，需要摆组件——不是坏了。

## 4. 看板数据格式（逆向自 v3 前端，无官方文档）

### 4.1 整体结构

```jsonc
{
  "type": "dashboard", // dashboard 用 "dashboard"；board 用 "mixed"/"website"/...
  "name": "",
  "description": "",
  "parameters": {
    "websiteId": "ae1b3d6f-0972-48ec-afb6-f1a8b7a79bd2", // ★ 必须带（见下方坑）
    "rows": [
      {
        "id": "<uuid>",
        "columns": [{ "id": "<uuid>", "component": {/* 见 4.2 */} }],
      },
    ],
  },
}
```

- 行内多列即并排组件（每行最多 4 列）；行高列宽只能在前端 Design 模式拖分隔条调整，不在 JSON 里。
- `id` 均为任意 uuid v4。

### 4.2 component 结构

```jsonc
{
  "type": "MetricsTable", // 组件类型，见 §5 清单
  "entityType": "website", // ★ 数据源绑定，见下方坑
  "entityId": "ae1b3d6f-...", // ★
  "title": "页面访问排行", // 可选，组件标题
  "description": "", // 可选
  "props": {
    // 可选，组件配置项（无配置组件可省略整个 props）
    "type": "path", // MetricsTable 的维度 prop 恰好也叫 type，嵌套在 props 里，与外层组件 type 不冲突
    "limit": 10,
  },
}
```

### 4.3 ★ 最大的坑：数据源绑定缺失 = 整页静默空白

前端渲染时：dashboard 类型被 `getBoardType({coerceDashboard:true})` 强制按 website 类型解析，数据源取 `parameters.websiteId`；每个组件再经 `getComponentEntity` 解析（自带 `entityType/entityId` 优先，否则回落到 board 级）。**两层都缺时组件查询无数据源，页面不报错、组件框都不渲染**。所以：

- `parameters.websiteId` 必填；
- 保险起见每个 component 也带 `entityType: "website"` + `entityId`。

另一个静默行为：组件 `type` 不在合法清单时，前端在渲染前把该组件置 null（不报错）。type 必须精确匹配 §5 的 PascalCase 名称。

## 5. 组件类型清单（17 种）

| type                                                         | 名称         | props                                           | 备注                                  |
| ------------------------------------------------------------ | ------------ | ----------------------------------------------- | ------------------------------------- |
| `WebsiteMetricsBar`                                          | 指标条       | —                                               | 访客/访问/跳出/平均停留时长           |
| `WebsiteChart`                                               | 访客趋势图   | —                                               | 按天浏览/访客曲线                     |
| `MetricsTable`                                               | 指标表格     | `type`（维度，默认 `path`）、`limit`（默认 10） | 维度清单见 §6                         |
| `WorldMap`                                                   | 世界地图     | —                                               |                                       |
| `WeeklyTraffic`                                              | 每周流量热图 | —                                               | 按天/小时的活跃分布                   |
| `EventsMetricsBar`                                           | 事件指标条   | —                                               | 访客/访问/事件/唯一事件               |
| `EventsChart`                                                | 事件趋势图   | —                                               | 自定义事件随时间                      |
| `TextBlock`                                                  | 文本         | `text`                                          | 自由文本块                            |
| `Goal` / `Funnel`                                            | 目标/漏斗    | `reportId`（必填）                              | 需先在 Reports 里建保存的 goal/funnel |
| `UTM`                                                        | UTM 分析     | `param`（默认 `utm_source`）、`limit`           | 桌面端无 UTM，用不上                  |
| `RealtimeHeader` / `RealtimeChart` / `RealtimeActiveUsers`   | 实时三件套   | —                                               | 实时访客                              |
| `RevenueMetricsBar` / `RevenueChart` / `RevenueMetricsTable` | 收入三件套   | `currency` 等                                   | 电商场景，用不上                      |

### MetricsTable 维度（props.type 可选值）

`path`（URL 路径）、`fullPath`、`entry`、`exit`、`title`、`query`、`referrer`、`channel`、`country`、`region`、`city`、`browser`、`os`、`device`、`language`、`screen`、`utmSource/Medium/Campaign/Content/Term`、`event`（事件名分组）、`hostname`。

## 6. 脚本化搭建（可直接复用）

```python
import json, urllib.request, uuid

BASE = "https://stats.taunote.app"
WID = "ae1b3d6f-0972-48ec-afb6-f1a8b7a79bd2"

def auth(password):
    req = urllib.request.Request(f"{BASE}/api/auth/login",
        data=json.dumps({"username": "admin", "password": password}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())["token"]

token = auth("<管理员密码>")

def comp(t, title=None, props=None):
    c = {"type": t, "entityType": "website", "entityId": WID}
    if title: c["title"] = title
    if props: c["props"] = props
    return c

def row(*cols):
    return {"id": str(uuid.uuid4()),
            "columns": [{"id": str(uuid.uuid4()), "component": c} for c in cols]}

payload = {
    "type": "dashboard", "name": "", "description": "",
    "parameters": {"websiteId": WID, "rows": [
        row(comp("WebsiteMetricsBar")),
        row(comp("WebsiteChart")),
        row(comp("MetricsTable", "页面访问排行", {"type": "path", "limit": 10}),
            comp("MetricsTable", "事件排行", {"type": "event", "limit": 10})),
        row(comp("WeeklyTraffic"), comp("WorldMap")),
        row(comp("EventsChart")),
    ]},
}
req = urllib.request.Request(f"{BASE}/api/dashboard",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer " + token}, method="POST")
print(urllib.request.urlopen(req).status)  # 200 即成功，刷新页面生效
```

改 board（Boards 菜单里的看板）用同一 parameters 结构，端点换成 `POST /api/boards`（创建）/ `PUT /api/boards/:id`（更新，或 POST 同效）。

## 7. 手动搭建（UI 操作）

1. 网站详情页（或 Boards → 新建看板，website 类型绑定 Tau Desktop）；
2. 右上角 **Design** 进入编辑模式；
3. **Add row** 加行 → 行内 **Add column** 加列（每行最多 4 列）；
4. 点 **Select Component** 选组件、配置参数（表格选维度、行数），**Save** 放置；
5. 拖行/列分隔条调整宽高；顶部日期选择器统一控制整页时间范围；
6. 界面语言：用户图标 → Profile → Language → 中文。

## 8. 客户端事件口径（桌面端）

上报实现：`apps/desktop/src-electron/main/modules/telemetry.ts`（BACKGROUND 模块），端点 `/api/send`，仅打包构建上报（`TAU_TELEMETRY_DEBUG=1` 可在 dev 强制），离线队列落盘 `~/.editor/telemetry.json`。

| 事件            | data 字段                                                                                                                                                                   | 用途                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `session_start` | `first_run` / `app_version` / `os` / `arch` / `locale`                                                                                                                      | 启动（first_run=true 即新增安装）                                                                                        |
| `app_ready`     | `startup_ms`                                                                                                                                                                | 首屏就绪耗时（渲染进程加载起算，含数据库连接＝用户从启动到能用的等待；AppShell boot ready 时一次性上报，切库不重复计）   |
| `heartbeat`     | `uptime_ms` / `active_ms`（窗口聚焦累计）                                                                                                                                   | 5 分钟一次；Umami 会话时长靠首末事件差，心跳保证崩溃场景下时长仍准                                                       |
| `session_end`   | `duration_ms` / `active_ms`                                                                                                                                                 | 退出                                                                                                                     |
| `screen_view`   | `page`（页面 key），urlPath 记为 `/page/<key>`                                                                                                                              | 栈顶页变化触发（AppShell），即「页面访问排行」的数据源                                                                   |
| `crash`         | `kind`（`uncaught_exception` / `unhandled_rejection` / `render_process_gone` / `child_process_gone`）、`reason`、`exit_code`、`stack`（home 路径替换为 `~`，截断 300 字符） | 崩溃感知：入队后立即落盘防丢失。边界：主进程自身 native 崩溃无法自报（需 Crashpad/minidump，Umami 收不了），其余场景覆盖 |

已保存的报表（Reports 菜单）：**周留存**（retention，window=24h）——看用户隔周回访率，个人产品最核心的健康指标。

访客去重：匿名设备 id（首启随机 UUID 存本地）编入 User-Agent 的 `Device/<id>`——Umami 按「IP+UA」哈希识别访客，UA 带稳定设备 id 后不随 IP 变化漂移。

业务功能埋点：渲染进程任意位置 `import { trackEvent } from "@/commands"` 调 `trackEvent("feature_xxx", {...})`，事件面板自动出现，无需后台登记。

## 9. 常用查询 API

```
GET /api/websites/:id/stats?startAt=<ms>&endAt=<ms>        # 访客/访问/浏览量汇总
GET /api/websites/:id/events?startAt=&endAt=               # 事件明细（必带时间窗）
GET /api/websites/:id/metrics?type=event&startAt=&endAt=   # 事件分组计数
GET /api/websites/:id/active                               # 实时在线
POST /api/websites                                         # 建站 {name, domain}（domain 必须是合法域名格式，不能带连字符的裸标识）
POST /api/reports                                          # 建报表 {websiteId, type, name, parameters}；type 枚举：attribution/breakdown/funnel/goal/heatmap/journey/performance/retention/revenue/utm
POST /api/send                                             # 事件上报（须带 User-Agent 头）
```

发送测试事件：

```bash
curl -s -X POST https://stats.taunote.app/api/send \
  -H "Content-Type: application/json" \
  -H "User-Agent: Tau/0.0.0-test (darwin; arm64) Device/test-01" \
  -d '{"payload":{"website":"<WID>","hostname":"tau-desktop","screen":"1x1","language":"zh-CN","url":"/page/test","referrer":"","ip":""},"type":"event","event_name":"screen_view","event_data":{"page":"test"}}'
```

## 10. 排坑记录

- **仪表盘整页空白**：九成是 §4.3 的数据源绑定缺失（`parameters.websiteId` / 组件 `entityType+entityId`），前端无任何报错；
- **`--platform linux/amd64` 拉到 arm64**：加速源 manifest 协商问题，按 digest 拉（§1）；
- **改密 405**：用 POST `/api/users/:id`；
- **建站 400 domain 校验**：domain 字段要真实域名格式（如 `app.xiongtao.life`），不能用 `tau-desktop` 这类标识；
- ssh 到该服务器传大文件会假死（数据不流动），用 rsync `--partial --inplace` 断点续传。
