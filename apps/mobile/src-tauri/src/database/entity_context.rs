//! 移动端脉络查询：对齐桌面端 entity-context 模块（context-query.ts / context-lineage.ts /
//! context-plugin-links.ts）的分区口径，纯本地 SQL 组装，查询时不发起任何 AI 调用。数据来自整库同步的主库与本地
//! 重建的 entity_refs 索引。与桌面端的裁剪差异：「相关」分区（向量在索引库、不同步）与
//! 「被使用 · 白板」（移动端无白板浏览）不做；「连接」分区的内联引用由前端解析
//! （@tau/shared/inline-refs）后经 entity_context_resolve_entities 补身份合并。

use rusqlite::{params, params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use tauri::AppHandle;

use super::query::find_first_text;
use super::schema;
use crate::setting::{get_active_database_name, load_or_init_setting};

const CONTEXT_LIMIT: usize = 50;
const SNIPPETS_PER_SOURCE: usize = 3;
const TITLE_CHARS: usize = 80;
/** IN 列表每批的正文数（locate 的 UNION 语句同一批参数绑定 5 次，需低于 SQLite 变量上限） */
const LOCATE_BATCH: usize = 200;

const CHAT_SCOPE_LABEL: &[(&str, &str)] = &[
    ("main-chat", "对话"),
    ("pdf-chat", "PDF 对话"),
    ("video-note-chat", "视频笔记对话"),
    ("vibe-learning-chat", "Notebook 对话"),
];

const KIND_LABEL: &[(&str, &str)] = &[
    ("card", "卡片"),
    ("article", "文章"),
    ("project-item", "项目文档"),
    ("diary-moment", "日记"),
    ("plugin-entity", "插件内容"),
    ("excerpt", "摘录"),
    ("pdf-annotation", "PDF 标注"),
    ("chat-session", "对话"),
    ("vl-note", "Notebook 笔记"),
    ("web-clip", "解析文档"),
    ("flashcard", "闪卡"),
    ("question", "问题"),
    ("vl-project", "Notebook"),
];

fn kind_label(kind: &str) -> String {
    KIND_LABEL
        .iter()
        .find(|(key, _)| *key == kind)
        .map(|(_, label)| label.to_string())
        .unwrap_or_else(|| kind.to_string())
}

/** 同一份正文被多个实体共用时，选哪个身份作代表：卡片 > 文章 > 项目文档 > 日记 > 插件内容 */
fn ref_priority(kind: &str) -> i32 {
    match kind {
        "card" => 0,
        "article" => 1,
        "project-item" => 2,
        "diary-moment" => 3,
        "plugin-entity" => 4,
        _ => 9,
    }
}

/** 存量类型写法收口（project_item → project-item）；不认识的返回 None */
fn normalize_entity_kind(raw: &str) -> Option<String> {
    match raw {
        "card" | "article" | "diary-moment" => Some(raw.to_string()),
        "project-item" | "project_item" => Some("project-item".to_string()),
        _ => None,
    }
}

fn clip_title(text: &str) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() > TITLE_CHARS {
        let clipped: String = flat.chars().take(TITLE_CHARS).collect();
        format!("{clipped}…")
    } else {
        flat
    }
}

/// Slate 正文 JSON 的全文拼接（块序拼接所有文字叶子，嵌套 content-link 无标题可代，
/// 与桌面 slatePlainText 的差异只影响片段类展示，不影响标题取舍）
fn collect_plain_text(value: &Value, out: &mut String) {
    match value {
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(Value::as_str) {
                out.push_str(text);
            }
            for child in map.values() {
                collect_plain_text(child, out);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_plain_text(child, out);
            }
        }
        _ => {}
    }
}

fn content_first_text(content_json: Option<String>, chars: usize) -> String {
    let Some(raw) = content_json else {
        return String::new();
    };
    let Ok(parsed) = serde_json::from_str::<Value>(&raw) else {
        return String::new();
    };
    let text = find_first_text(&parsed).unwrap_or_default();
    let mut result = String::new();
    for (idx, ch) in text.chars().enumerate() {
        if idx >= chars {
            result.push('…');
            break;
        }
        result.push(ch);
    }
    result
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct EntityRefLite {
    kind: String,
    id: i64,
}

impl EntityRefLite {
    fn key(&self) -> String {
        format!("{}:{}", self.kind, self.id)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiaryLocator {
    pub date: String,
    pub moment_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEntityData {
    pub kind: String,
    pub id: i64,
    pub content_id: Option<i64>,
    pub title: String,
    pub meta: String,
    /// 日记条目的定位信息（跳转到当天的该片段）；其余类型由前端按 kind 映射
    pub diary: Option<DiaryLocator>,
    /// 插件内容的类型名（插件声明，随库保存）；其余类型为空，前端按 kind 取
    pub kind_label: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLinkData {
    pub entity: ContextEntityData,
    pub inline_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefSnippetData {
    pub before: String,
    pub label: String,
    pub after: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextBacklinkData {
    pub source: ContextEntityData,
    pub snippets: Vec<RefSnippetData>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextQuestionData {
    pub id: i64,
    pub title: String,
    pub status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLineageItemData {
    pub kind: String,
    /// 谱系端点 id 统一以文本返回（对话 id 是字符串，其余是数字）
    pub node_id: String,
    pub relation: String,
    pub title: String,
    pub meta: String,
    pub missing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextUsageData {
    /// "todo" | "notebook"
    pub kind: String,
    pub key: String,
    pub title: String,
    pub completed: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMetaSummary {
    pub title: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityContextResponse {
    pub self_entity: ContextEntityData,
    pub self_content_ids: Vec<i64>,
    /// 显式连接（content_links）；内联引用由前端解析自身正文后合并进该分区
    pub links: Vec<ContextLinkData>,
    pub projections: Vec<ContextEntityData>,
    pub backlinks: Vec<ContextBacklinkData>,
    pub backlink_total: i64,
    pub questions: Vec<ContextQuestionData>,
    /// 哪些插件内容关联了我（或共用正文的身份），按最近关联排序
    pub plugin_links: Vec<ContextEntityData>,
    pub sources: Vec<ContextLineageItemData>,
    pub derived: Vec<ContextLineageItemData>,
    pub notebook_projections: Vec<ContextLineageItemData>,
    pub usages: Vec<ContextUsageData>,
    pub ai_meta: Option<AiMetaSummary>,
    /// 自身正文（SQL 预过滤含 content-link 的），前端用 @tau/shared/inline-refs 解析
    pub inline_sources: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveRefInput {
    pub kind: String,
    pub id: i64,
}

/** 正文实体在插件引用（plugin_links.to_kind）里的类型与创建时间查询 */
fn plugin_ref_kind(kind: &str) -> Option<(&'static str, &'static str)> {
    match kind {
        "card" => Some(("card", "SELECT create_time FROM cards WHERE id = ?1")),
        "article" => Some((
            "article",
            "SELECT create_time FROM articles WHERE id = ?1 AND is_delete = 0",
        )),
        "project-item" => Some((
            "document",
            "SELECT create_time FROM project_item WHERE id = ?1",
        )),
        "diary-moment" => Some((
            "diary",
            "SELECT create_time FROM diary_segments WHERE id = ?1",
        )),
        "plugin-entity" => Some((
            "plugin-entity",
            "SELECT create_time FROM plugin_entities WHERE id = ?1",
        )),
        _ => None,
    }
}

/**
 * 「被关联」：哪些插件内容（plugin_links）关联了这个实体或共用正文的身份，对齐桌面
 * context-plugin-links.ts——同一来源合并、按最近关联排序；关联记下的目标创建时间与当前不一致
 * （编号被复用）、来源插件已卸载（孤儿）、插件内容关联自己时不算。
 */
fn plugin_links_of(conn: &Connection, identities: &[EntityRefLite]) -> Vec<ContextEntityData> {
    let Ok(mut inbound) = conn.prepare(
        "SELECT l.from_id, MAX(l.create_time) FROM plugin_links l
         JOIN plugin_entities e ON e.id = l.from_id AND e.orphaned_time IS NULL
         WHERE l.to_kind = ?1 AND l.to_id = ?2 AND l.to_created_at = ?3
         GROUP BY l.from_id",
    ) else {
        return vec![];
    };
    let mut sources: HashMap<i64, i64> = HashMap::new();
    for identity in identities {
        let Some((kind, created_sql)) = plugin_ref_kind(&identity.kind) else {
            continue;
        };
        let Ok(created) = conn.query_row(created_sql, params![identity.id], |row| {
            row.get::<_, i64>(0)
        }) else {
            continue;
        };
        let rows = inbound
            .query_map(params![kind, identity.id.to_string(), created], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
            .unwrap_or_default();
        for (from_id, linked) in rows {
            let entry = sources.entry(from_id).or_insert(linked);
            *entry = (*entry).max(linked);
        }
    }
    for identity in identities {
        if identity.kind == "plugin-entity" {
            sources.remove(&identity.id);
        }
    }
    let mut ordered: Vec<(i64, i64)> = sources.into_iter().collect();
    ordered.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    ordered
        .into_iter()
        .filter_map(|(id, _)| resolve_entity(conn, "plugin-entity", id))
        .take(CONTEXT_LIMIT)
        .collect()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveEntitiesPayload {
    pub refs: Vec<ResolveRefInput>,
}

/** 实体对应的正文（日记精确到一条片段）；实体不存在为空 */
fn content_ids_of_entity(conn: &Connection, kind: &str, id: i64) -> Vec<i64> {
    let sql = match kind {
        "card" => "SELECT content_id FROM cards WHERE id = ?1",
        "article" => "SELECT content_id FROM articles WHERE id = ?1 AND is_delete = 0",
        "project-item" => "SELECT content_id FROM project_item WHERE id = ?1",
        "diary-moment" => "SELECT content_id FROM diary_segments WHERE id = ?1",
        "plugin-entity" => "SELECT content_id FROM plugin_entities WHERE id = ?1",
        _ => return vec![],
    };
    conn.query_row(sql, params![id], |row| row.get::<_, Option<i64>>(0))
        .ok()
        .flatten()
        .filter(|content_id| *content_id > 0)
        .into_iter()
        .collect()
}

/** 一批正文各自对应的全部实体（一份正文可被卡片、文章、项目文档、日记共用），按代表优先级排序 */
fn locate_all(conn: &Connection, content_ids: &[i64]) -> HashMap<i64, Vec<EntityRefLite>> {
    let mut ids: Vec<i64> = content_ids
        .iter()
        .copied()
        .filter(|id| *id > 0)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    ids.sort_unstable();
    let mut result: HashMap<i64, Vec<EntityRefLite>> = HashMap::new();
    for batch in ids.chunks(LOCATE_BATCH) {
        let marks = vec!["?"; batch.len()].join(",");
        let sql = format!(
            "SELECT 'card' AS kind, id, content_id FROM cards WHERE content_id IN ({marks})
             UNION ALL SELECT 'article', id, content_id FROM articles WHERE content_id IN ({marks}) AND is_delete = 0
             UNION ALL SELECT 'project-item', id, content_id FROM project_item WHERE content_id IN ({marks})
             UNION ALL SELECT DISTINCT 'diary-moment', s.id, s.content_id FROM diary_segments s
               JOIN diary_entries d ON d.id = s.diary_id WHERE s.content_id IN ({marks})
             UNION ALL SELECT 'plugin-entity', id, content_id FROM plugin_entities WHERE content_id IN ({marks})"
        );
        let Ok(mut stmt) = conn.prepare(&sql) else {
            continue;
        };
        let mut bind: Vec<i64> = Vec::with_capacity(batch.len() * 5);
        for _ in 0..5 {
            bind.extend_from_slice(batch);
        }
        let rows = stmt
            .query_map(params_from_iter(bind), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>());
        if let Ok(rows) = rows {
            for (kind, id, content_id) in rows {
                result
                    .entry(content_id)
                    .or_default()
                    .push(EntityRefLite { kind, id });
            }
        }
    }
    for list in result.values_mut() {
        list.sort_by(|a, b| {
            ref_priority(&a.kind)
                .cmp(&ref_priority(&b.kind))
                .then(a.id.cmp(&b.id))
        });
    }
    result
}

/** content_ai_meta 里预生成的 AI 标题（有才用） */
fn ai_title_of(conn: &Connection, content_id: i64) -> Option<String> {
    let raw = conn
        .query_row(
            "SELECT meta FROM content_ai_meta WHERE content_id = ?1",
            params![content_id],
            |row| row.get::<_, String>(0),
        )
        .ok()?;
    let parsed = serde_json::from_str::<Value>(&raw).ok()?;
    let title = parsed.get("title")?.as_str()?.trim().to_string();
    (!title.is_empty()).then_some(title)
}

fn hhmm_of_millis(millis: i64) -> String {
    let total_seconds = (millis.max(0) / 1000) % 86400;
    format!(
        "{:02}:{:02}",
        total_seconds / 3600,
        (total_seconds % 3600) / 60
    )
}

/** 单个实体的展示信息；已不存在返回 None */
fn resolve_entity(conn: &Connection, kind: &str, id: i64) -> Option<ContextEntityData> {
    match kind {
        "card" => {
            let content_id = conn
                .query_row(
                    "SELECT content_id FROM cards WHERE id = ?1",
                    params![id],
                    |row| row.get::<_, Option<i64>>(0),
                )
                .ok()??;
            let content_json = content_raw_of(conn, content_id);
            let title = ai_title_of(conn, content_id)
                .filter(|title| !title.trim().is_empty())
                .or_else(|| {
                    let first = content_first_text(content_json.clone(), TITLE_CHARS);
                    (!first.is_empty()).then_some(first)
                })
                .unwrap_or_else(|| "无标题卡片".to_string());
            Some(ContextEntityData {
                kind: kind.to_string(),
                id,
                content_id: Some(content_id),
                title,
                meta: String::new(),
                diary: None,
                kind_label: None,
            })
        }
        "article" => {
            let row = conn
                .query_row(
                    "SELECT title, content_id FROM articles WHERE id = ?1 AND is_delete = 0",
                    params![id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
                )
                .ok()?;
            let (title, content_id) = row;
            Some(ContextEntityData {
                kind: kind.to_string(),
                id,
                content_id,
                title: if title.trim().is_empty() {
                    "无标题文章".to_string()
                } else {
                    title
                },
                meta: String::new(),
                diary: None,
                kind_label: None,
            })
        }
        "project-item" => {
            let row = conn
                .query_row(
                    "SELECT p.title, p.content_id, p.projects FROM project_item p WHERE p.id = ?1",
                    params![id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<i64>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )
                .ok()?;
            let (title, content_id, projects_raw) = row;
            let project_id = projects_raw
                .as_deref()
                .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
                .and_then(|value| value.as_array().map(|items| items.to_vec()))
                .and_then(|items| items.first().and_then(Value::as_i64));
            let meta = project_id
                .and_then(|project_id| {
                    conn.query_row(
                        "SELECT title FROM project WHERE id = ?1",
                        params![project_id],
                        |row| row.get::<_, String>(0),
                    )
                    .ok()
                })
                .unwrap_or_default();
            Some(ContextEntityData {
                kind: kind.to_string(),
                id,
                content_id,
                title: if title.trim().is_empty() {
                    "无标题文档".to_string()
                } else {
                    title
                },
                meta,
                diary: None,
                kind_label: None,
            })
        }
        "diary-moment" => {
            let row = conn
                .query_row(
                    "SELECT s.content_id, s.create_time, e.date FROM diary_segments s
                     JOIN diary_entries e ON e.id = s.diary_id WHERE s.id = ?1",
                    params![id],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                        ))
                    },
                )
                .ok()?;
            let (content_id, create_time, date) = row;
            let content_json = content_raw_of(conn, content_id);
            let first = content_first_text(content_json, 40);
            let title = if first.is_empty() {
                "空白日记".to_string()
            } else {
                first
            };
            Some(ContextEntityData {
                kind: kind.to_string(),
                id,
                content_id: Some(content_id),
                title,
                meta: format!("{} {}", date, hhmm_of_millis(create_time)),
                diary: Some(DiaryLocator {
                    date,
                    moment_id: id,
                }),
                kind_label: None,
            })
        }
        "plugin-entity" => {
            let row = conn
                .query_row(
                    "SELECT e.title, e.content_id, k.label FROM plugin_entities e
                     LEFT JOIN plugin_entity_kinds k ON k.plugin_id = e.plugin_id AND k.kind = e.kind
                     WHERE e.id = ?1",
                    params![id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                )
                .ok()?;
            let (title, content_id, label) = row;
            let title = if title.trim().is_empty() {
                let first = content_first_text(content_raw_of(conn, content_id), TITLE_CHARS);
                if first.is_empty() {
                    "无标题".to_string()
                } else {
                    first
                }
            } else {
                title
            };
            Some(ContextEntityData {
                kind: kind.to_string(),
                id,
                content_id: Some(content_id),
                title,
                meta: String::new(),
                diary: None,
                kind_label: label.filter(|label| !label.trim().is_empty()),
            })
        }
        _ => None,
    }
}

fn content_raw_of(conn: &Connection, content_id: i64) -> Option<String> {
    conn.query_row(
        "SELECT content FROM contents WHERE id = ?1",
        params![content_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .ok()
    .flatten()
}

fn content_update_times(conn: &Connection, ids: &[i64]) -> HashMap<i64, i64> {
    let mut times = HashMap::new();
    if ids.is_empty() {
        return times;
    }
    let marks = vec!["?"; ids.len()].join(",");
    let sql = format!("SELECT id, update_time FROM contents WHERE id IN ({marks})");
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return times;
    };
    if let Ok(rows) = stmt.query_map(params_from_iter(ids.iter().copied()), |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
    }) {
        for row in rows.flatten() {
            times.insert(row.0, row.1);
        }
    }
    times
}

/** 「连接」分区的显式部分：content_links 邻接边，目标按代表身份展示，已滤自身与身份重复 */
fn explicit_links_of(
    conn: &Connection,
    content_ids: &[i64],
    exclude: &HashSet<String>,
) -> Vec<ContextLinkData> {
    let self_contents: HashSet<i64> = content_ids.iter().copied().collect();
    let ids: Vec<i64> = self_contents.iter().copied().collect();
    if ids.is_empty() {
        return vec![];
    }
    let marks = vec!["?"; ids.len()].join(",");
    let sql = format!(
        "SELECT content_id, target_content_id FROM content_links
         WHERE content_id IN ({marks}) OR target_content_id IN ({marks})
         ORDER BY create_time, rowid"
    );
    let mut bind: Vec<i64> = Vec::with_capacity(ids.len() * 2);
    bind.extend_from_slice(&ids);
    bind.extend_from_slice(&ids);
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return vec![];
    };
    let edges = stmt
        .query_map(params_from_iter(bind), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>());
    let Ok(edges) = edges else {
        return vec![];
    };

    let mut targets: Vec<i64> = edges
        .iter()
        .flat_map(|(a, b)| [*a, *b])
        .filter(|content_id| !self_contents.contains(content_id))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    targets.sort_unstable();
    let located = locate_all(conn, &targets);

    let mut links: Vec<ContextLinkData> = Vec::new();
    let mut seen: HashSet<String> = exclude.clone();
    for (a, b) in edges {
        let target = if self_contents.contains(&a) { b } else { a };
        if self_contents.contains(&target) {
            continue;
        }
        if links.len() >= CONTEXT_LIMIT {
            break;
        }
        let Some(reference) = located.get(&target).and_then(|list| list.first()) else {
            continue;
        };
        let key = reference.key();
        if seen.contains(&key) {
            continue;
        }
        let Some(entity) = resolve_entity(conn, &reference.kind, reference.id) else {
            continue;
        };
        seen.insert(key);
        links.push(ContextLinkData {
            entity,
            inline_only: false,
        });
    }
    links
}

/** 「被引用」分区：索引库 entity_refs 反查，按来源分组带片段；unresolved（白板正文等）丢弃 */
fn backlinks_of(
    main_conn: &Connection,
    index_conn: &Connection,
    kind: &str,
    id: i64,
    self_contents: &[i64],
) -> (Vec<ContextBacklinkData>, i64) {
    let has_refs = index_conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='entity_refs' AND type='table')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|found| found > 0)
        .unwrap_or(false);
    if !has_refs {
        return (vec![], 0);
    }
    let self_set: HashSet<i64> = self_contents.iter().copied().collect();
    let by_content = if self_contents.is_empty() {
        String::new()
    } else {
        let marks = vec!["?"; self_contents.len()].join(",");
        format!("dst_content_id IN ({marks}) OR ")
    };
    let sql = format!(
        "SELECT src_content_id, snippet_before, snippet_label, snippet_after FROM entity_refs
         WHERE {by_content}(dst_kind = ? AND dst_id = ?) ORDER BY rowid"
    );
    let mut bind: Vec<StringOrInt> = self_contents
        .iter()
        .map(|content_id| StringOrInt::Int(*content_id))
        .collect();
    bind.push(StringOrInt::Text(kind.to_string()));
    bind.push(StringOrInt::Int(id));
    let Ok(mut stmt) = index_conn.prepare(&sql) else {
        return (vec![], 0);
    };
    let rows = stmt
        .query_map(params_from_iter(bind), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>());
    let Ok(rows) = rows else {
        return (vec![], 0);
    };
    let external: Vec<_> = rows
        .into_iter()
        .filter(|(src, _, _, _)| !self_set.contains(src))
        .collect();
    if external.is_empty() {
        return (vec![], 0);
    }

    let src_ids: Vec<i64> = external
        .iter()
        .map(|(src, _, _, _)| *src)
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let located = locate_all(main_conn, &src_ids);
    let update_times = content_update_times(main_conn, &src_ids);

    struct BacklinkGroup {
        reference: EntityRefLite,
        time: i64,
        snippets: Vec<RefSnippetData>,
    }
    let mut groups: HashMap<String, BacklinkGroup> = HashMap::new();
    for (src, before, label, after) in external {
        let Some(reference) = located.get(&src).and_then(|list| list.first()) else {
            continue;
        };
        if reference.kind == kind && reference.id == id {
            continue;
        }
        let group = groups
            .entry(reference.key())
            .or_insert_with(|| BacklinkGroup {
                reference: reference.clone(),
                time: *update_times.get(&src).unwrap_or(&0),
                snippets: Vec::new(),
            });
        if group.snippets.len() < SNIPPETS_PER_SOURCE {
            group.snippets.push(RefSnippetData {
                before,
                label,
                after,
            });
        }
    }

    let total = groups.len() as i64;
    let mut ordered: Vec<BacklinkGroup> = groups.into_values().collect();
    ordered.sort_by(|a, b| {
        b.time
            .cmp(&a.time)
            .then(ref_priority(&a.reference.kind).cmp(&ref_priority(&b.reference.kind)))
    });
    let mut backlinks = Vec::new();
    for group in ordered {
        if backlinks.len() >= CONTEXT_LIMIT {
            break;
        }
        let Some(entity) = resolve_entity(main_conn, &group.reference.kind, group.reference.id)
        else {
            continue;
        };
        backlinks.push(ContextBacklinkData {
            source: entity,
            snippets: group.snippets,
        });
    }
    (backlinks, total)
}

enum StringOrInt {
    Int(i64),
    Text(String),
}

impl rusqlite::ToSql for StringOrInt {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        use rusqlite::types::{ToSqlOutput, Value as SqlValue, ValueRef};
        Ok(match self {
            StringOrInt::Int(value) => ToSqlOutput::Owned(SqlValue::Integer(*value)),
            StringOrInt::Text(value) => ToSqlOutput::Borrowed(ValueRef::Text(value.as_bytes())),
        })
    }
}

fn question_target_type(kind: &str) -> Option<&'static str> {
    match kind {
        "card" => Some("card"),
        "article" => Some("article"),
        "project-item" => Some("project_item"),
        _ => None,
    }
}

/** 「相关问题」分区：问题材料按目标身份关联，答案正文被投影时按 answer:contentId 关联 */
fn questions_of(
    conn: &Connection,
    identities: &[EntityRefLite],
    content_ids: &[i64],
) -> Vec<ContextQuestionData> {
    let mut rows: Vec<(i64, String, String)> = Vec::new();
    for reference in identities {
        let Some(target_type) = question_target_type(&reference.kind) else {
            continue;
        };
        let sql = "SELECT q.id, q.question_content, q.status FROM question_link l
                   JOIN questions q ON q.id = l.question_id
                   WHERE l.target_type = ?1 AND l.target_id = ?2 ORDER BY q.update_time DESC";
        if let Ok(found) = conn.prepare(sql).and_then(|mut stmt| {
            stmt.query_map(params![target_type, reference.id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    row.get::<_, String>(2)?,
                ))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        }) {
            rows.extend(found);
        }
    }
    if !content_ids.is_empty() {
        let marks = vec!["?"; content_ids.len()].join(",");
        let sql = format!(
            "SELECT q.id, q.question_content, q.status FROM question_link l
             JOIN questions q ON q.id = l.question_id
             WHERE l.target_type = 'answer' AND l.target_id IN ({marks}) ORDER BY q.update_time DESC"
        );
        if let Ok(found) = conn.prepare(&sql).and_then(|mut stmt| {
            stmt.query_map(params_from_iter(content_ids.iter().copied()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                    row.get::<_, String>(2)?,
                ))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        }) {
            rows.extend(found);
        }
    }
    let mut seen: HashSet<i64> = HashSet::new();
    let mut questions: Vec<ContextQuestionData> = Vec::new();
    for (id, title, status) in rows {
        if questions.len() >= CONTEXT_LIMIT || seen.contains(&id) {
            continue;
        }
        seen.insert(id);
        questions.push(ContextQuestionData { id, title, status });
    }
    questions
}

struct LineageEdgeRow {
    kind: String,
    node_id: String,
    relation: String,
    create_time: i64,
}

/// 存储的谱系端点 → 规范元组；不认识的 kind 或非法 id 返回 None（调用方丢弃），
/// 与桌面 fromStoredLineageNode 一致
fn parse_lineage_node(kind: &str, id: &str) -> Option<(String, String)> {
    if kind == "chat-session" {
        return (!id.is_empty()).then(|| (kind.to_string(), id.to_string()));
    }
    let numeric: i64 = id.parse().ok()?;
    if numeric <= 0 {
        return None;
    }
    if matches!(
        kind,
        "excerpt"
            | "pdf-annotation"
            | "web-clip"
            | "vl-note"
            | "flashcard"
            | "question"
            | "vl-project"
    ) {
        return Some((kind.to_string(), numeric.to_string()));
    }
    normalize_entity_kind(kind).map(|kind| (kind, numeric.to_string()))
}

/**
 * 谱系边查询：按 where_direction 侧的端点过滤，取 select_direction 侧的端点
 * （来源 = 按 dst 过滤取 src；衍生 = 按 src 过滤取 dst），与桌面 EntityLineageTable 一致。
 */
fn lineage_edges_of(
    conn: &Connection,
    where_direction: &str,
    select_direction: &str,
    identities: &[EntityRefLite],
) -> Vec<LineageEdgeRow> {
    if identities.is_empty() {
        return vec![];
    }
    // 身份 kind 已规范化为 project-item，但存量谱系里可能存的是 project_item，两种都查
    let mut clauses = Vec::with_capacity(identities.len());
    let mut bind: Vec<StringOrInt> = Vec::with_capacity(identities.len() * 4);
    for reference in identities {
        if reference.kind == "project-item" {
            clauses.push(format!(
                "({where_direction}_kind IN ('project-item', 'project_item') AND {where_direction}_id = ?)"
            ));
            bind.push(StringOrInt::Int(reference.id));
        } else {
            clauses.push(format!(
                "({where_direction}_kind = ? AND {where_direction}_id = ?)"
            ));
            bind.push(StringOrInt::Text(reference.kind.clone()));
            bind.push(StringOrInt::Int(reference.id));
        }
    }
    let sql = format!(
        "SELECT {select_direction}_kind, {select_direction}_id, relation, create_time FROM entity_lineage
         WHERE {} ORDER BY create_time DESC, id DESC",
        clauses.join(" OR ")
    );
    let Ok(mut stmt) = conn.prepare(&sql) else {
        return vec![];
    };
    stmt.query_map(params_from_iter(bind), |row| {
        Ok(LineageEdgeRow {
            kind: row.get(0)?,
            node_id: row.get(1)?,
            relation: row.get(2)?,
            create_time: row.get(3)?,
        })
    })
    .map(|rows| {
        rows.filter_map(Result::ok)
            .filter_map(|row| {
                parse_lineage_node(&row.kind, &row.node_id).map(|(kind, node_id)| LineageEdgeRow {
                    kind,
                    node_id,
                    relation: row.relation,
                    create_time: row.create_time,
                })
            })
            .collect()
    })
    .unwrap_or_default()
}

struct ResolvedNode {
    title: String,
    meta: String,
}

/// 摘录按提供方名称、来源标题与位置展示（与桌面 entity/excerpt/display.ts 同口径），不读提供方私有定位
fn excerpt_node(conn: &Connection, id: i64) -> Option<ResolvedNode> {
    let row = conn
        .query_row(
            "SELECT e.source_type, COALESCE(p.label, e.source_type), e.source_key, e.source_title,
                    e.quote, e.location, e.url, e.is_deleted
             FROM excerpt e LEFT JOIN excerpt_provider p ON p.source_type = e.source_type
             WHERE e.id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )
        .ok()?;
    let (label, source_key, source_title, quote, location, url, is_deleted) = row;
    let source = if !source_title.trim().is_empty() {
        source_title.trim().to_string()
    } else {
        [url.as_deref().unwrap_or(""), source_key.as_str()]
            .into_iter()
            .map(host_of_url)
            .find(|host| !host.is_empty())
            .unwrap_or_else(|| "未知来源".to_string())
    };
    let mut meta = [label, source, location.trim().to_string()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");
    if is_deleted != 0 {
        meta.push_str(" · 原划线已删除");
    }
    Some(ResolvedNode {
        title: clip_title(&quote),
        meta,
    })
}

/// 只认 http(s) 地址的域名，非地址返回空串
fn host_of_url(value: &str) -> String {
    let rest = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"));
    rest.and_then(|rest| rest.split(['/', '?', '#']).next())
        .map(str::to_string)
        .unwrap_or_default()
}

fn pdf_annotation_node(conn: &Connection, id: i64) -> Option<ResolvedNode> {
    let row = conn
        .query_row(
            "SELECT a.page_num, a.annotation_payload, a.notes, a.type, p.file_name
             FROM pdf_annotations a JOIN pdfs p ON p.id = a.pdf_id WHERE a.id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .ok()?;
    let (page_num, payload, notes, kind, file_name) = row;
    let quote = serde_json::from_str::<Value>(&payload)
        .ok()
        .and_then(|payload| {
            payload
                .pointer("/custom/text")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    payload
                        .get("contents")
                        .and_then(Value::as_str)
                        .map(|text| text.trim().to_string())
                })
        })
        .unwrap_or_default();
    let note = serde_json::from_str::<Value>(&notes)
        .ok()
        .and_then(|notes| notes.as_array().cloned())
        .and_then(|items| items.first().cloned())
        .and_then(|first| first.get("note").cloned())
        .and_then(|note| {
            let mut text = String::new();
            collect_plain_text(&note, &mut text);
            let trimmed = text.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .unwrap_or_default();
    let page = page_num + 1;
    let margin = kind.as_deref() == Some("margin");
    let title = if !quote.is_empty() {
        clip_title(&quote)
    } else if !note.is_empty() {
        clip_title(&note)
    } else {
        format!(
            "{} · 第 {page} 页",
            if margin {
                "页边批注"
            } else {
                "区域截图"
            }
        )
    };
    Some(ResolvedNode {
        title,
        meta: format!(
            "PDF · {} · 第 {page} 页{}",
            file_name.unwrap_or_default(),
            if margin { " · 页边" } else { "" }
        ),
    })
}

/** 谱系端点的展示信息；已删除或不在脉络里展示（web-clip）返回 None */
fn resolve_lineage_node(conn: &Connection, kind: &str, node_id: &str) -> Option<ResolvedNode> {
    let numeric: i64 = node_id.parse().ok()?;
    match kind {
        "chat-session" => {
            let row = conn
                .query_row(
                    "SELECT title, scope FROM chat_session WHERE id = ?1",
                    params![node_id],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .ok()?;
            let scope_label = CHAT_SCOPE_LABEL
                .iter()
                .find(|(key, _)| *key == row.1)
                .map(|(_, label)| label.to_string())
                .unwrap_or_else(|| "对话".to_string());
            Some(ResolvedNode {
                title: if row.0.trim().is_empty() {
                    "未命名对话".to_string()
                } else {
                    row.0
                },
                meta: scope_label,
            })
        }
        "vl-note" => {
            let row = conn
                .query_row(
                    "SELECT n.title, p.title FROM vl_note n
                     JOIN vibe_learning_project p ON p.id = n.project_id WHERE n.id = ?1",
                    params![numeric],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .ok()?;
            Some(ResolvedNode {
                title: if row.0.trim().is_empty() {
                    "未命名笔记".to_string()
                } else {
                    row.0
                },
                meta: format!("Notebook · {}", row.1),
            })
        }
        "flashcard" => {
            let row = conn
                .query_row(
                    "SELECT f.prompt, d.name FROM flashcards f
                     JOIN flashcard_decks d ON d.id = f.deck_id WHERE f.id = ?1",
                    params![numeric],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                )
                .ok()?;
            let mut prompt_text = String::new();
            if let Ok(prompt) = serde_json::from_str::<Value>(&row.0) {
                collect_plain_text(&prompt, &mut prompt_text);
            }
            let prompt_text = prompt_text.trim().to_string();
            let title = if prompt_text.is_empty() {
                "闪卡".to_string()
            } else {
                clip_title(&prompt_text)
            };
            Some(ResolvedNode {
                title,
                meta: format!("闪卡 · {}", row.1),
            })
        }
        "question" => {
            let title = conn
                .query_row(
                    "SELECT question_content FROM questions WHERE id = ?1",
                    params![numeric],
                    |row| row.get::<_, Option<String>>(0),
                )
                .ok()??;
            Some(ResolvedNode {
                title: clip_title(if title.trim().is_empty() {
                    "未命名问题"
                } else {
                    &title
                }),
                meta: "问题".to_string(),
            })
        }
        "vl-project" => {
            let title = conn
                .query_row(
                    "SELECT title FROM vibe_learning_project WHERE id = ?1",
                    params![numeric],
                    |row| row.get::<_, String>(0),
                )
                .ok()?;
            Some(ResolvedNode {
                title: if title.trim().is_empty() {
                    "未命名 Notebook".to_string()
                } else {
                    title
                },
                meta: "Notebook".to_string(),
            })
        }
        "web-clip" => None,
        "excerpt" => excerpt_node(conn, numeric),
        "pdf-annotation" => pdf_annotation_node(conn, numeric),
        _ => {
            let entity = resolve_entity(conn, kind, numeric)?;
            Some(ResolvedNode {
                meta: if entity.meta.is_empty() {
                    kind_label(kind)
                } else {
                    entity.meta
                },
                title: entity.title,
            })
        }
    }
}

fn to_lineage_item(edge: LineageEdgeRow, resolved: Option<ResolvedNode>) -> ContextLineageItemData {
    let fallback_meta = resolved
        .as_ref()
        .map(|node| node.meta.clone())
        .unwrap_or_else(|| kind_label(&edge.kind));
    ContextLineageItemData {
        kind: edge.kind,
        node_id: edge.node_id,
        relation: edge.relation,
        title: resolved
            .as_ref()
            .map(|node| node.title.clone())
            .unwrap_or_default(),
        meta: fallback_meta,
        missing: resolved.is_none(),
    }
}

/** 「来源」分区：我从哪来；来源已删除的保留一行并标记 missing，web-clip 未解析的跳过 */
fn sources_of(conn: &Connection, identities: &[EntityRefLite]) -> Vec<ContextLineageItemData> {
    let mut seen = HashSet::new();
    let self_keys: HashSet<String> = identities.iter().map(|r| r.key()).collect();
    let mut items = Vec::new();
    for edge in lineage_edges_of(conn, "dst", "src", identities) {
        let key = format!("{}:{}", edge.kind, edge.node_id);
        if seen.contains(&key) || self_keys.contains(&key) {
            continue;
        }
        seen.insert(key.clone());
        let resolved = resolve_lineage_node(conn, &edge.kind, &edge.node_id);
        if resolved.is_none() && edge.kind == "web-clip" {
            continue;
        }
        items.push(to_lineage_item(edge, resolved));
        if items.len() >= CONTEXT_LIMIT {
            break;
        }
    }
    items
}

/** 「衍生」分区：谱系出边 + 引用我正文的闪卡（查询时推导）；已删除的不返回 */
fn derived_of(
    conn: &Connection,
    identities: &[EntityRefLite],
    content_ids: &[i64],
) -> Vec<ContextLineageItemData> {
    let mut edges = lineage_edges_of(conn, "src", "dst", identities);
    if !content_ids.is_empty() {
        let marks = vec!["?"; content_ids.len()].join(",");
        let sql = format!(
            "SELECT r.card_id, MAX(f.create_time) FROM flashcard_references r
             JOIN flashcards f ON f.id = r.card_id
             WHERE r.content_id IN ({marks}) GROUP BY r.card_id"
        );
        if let Ok(rows) = conn.prepare(&sql).and_then(|mut stmt| {
            stmt.query_map(params_from_iter(content_ids.iter().copied()), |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        }) {
            for (card_id, create_time) in rows {
                edges.push(LineageEdgeRow {
                    kind: "flashcard".to_string(),
                    node_id: card_id.to_string(),
                    relation: "derived".to_string(),
                    create_time,
                });
            }
        }
    }
    edges.sort_by(|a, b| b.create_time.cmp(&a.create_time));
    let mut seen: HashSet<String> = identities.iter().map(|r| r.key()).collect();
    let mut items = Vec::new();
    for edge in edges {
        let key = format!("{}:{}", edge.kind, edge.node_id);
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key.clone());
        let Some(resolved) = resolve_lineage_node(conn, &edge.kind, &edge.node_id) else {
            continue;
        };
        items.push(to_lineage_item(edge, Some(resolved)));
        if items.len() >= CONTEXT_LIMIT {
            break;
        }
    }
    items
}

/** 与我共用正文的 Notebook 笔记（「转为卡片 / 文章」是投影） */
fn notebook_projections_of(conn: &Connection, content_ids: &[i64]) -> Vec<ContextLineageItemData> {
    if content_ids.is_empty() {
        return vec![];
    }
    let marks = vec!["?"; content_ids.len()].join(",");
    let sql = format!(
        "SELECT id, create_time FROM vl_note WHERE content_id IN ({marks})
         ORDER BY create_time DESC LIMIT {CONTEXT_LIMIT}"
    );
    let Ok(rows) = conn.prepare(&sql).and_then(|mut stmt| {
        stmt.query_map(params_from_iter(content_ids.iter().copied()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
    }) else {
        return vec![];
    };
    rows.into_iter()
        .filter_map(|(id, create_time)| {
            let resolved = resolve_lineage_node(conn, "vl-note", &id.to_string())?;
            Some(to_lineage_item(
                LineageEdgeRow {
                    kind: "vl-note".to_string(),
                    node_id: id.to_string(),
                    relation: "derived".to_string(),
                    create_time,
                },
                Some(resolved),
            ))
        })
        .collect()
}

/** 「被使用」分区（主库部分）：待办与 Notebook 资源；白板部分依赖索引库 whiteboard_refs，移动端不做 */
fn usages_of(conn: &Connection, content_ids: &[i64]) -> Vec<ContextUsageData> {
    let mut usages = Vec::new();
    if !content_ids.is_empty() {
        let marks = vec!["?"; content_ids.len()].join(",");
        let sql = format!(
            "SELECT DISTINCT t.id, t.title, t.is_completed FROM todo_note_link l
             JOIN todo_item t ON t.id = l.todo_id
             WHERE l.content_id IN ({marks}) AND t.is_archived = 0
             ORDER BY t.is_completed, t.update_time DESC LIMIT {CONTEXT_LIMIT}"
        );
        if let Ok(rows) = conn.prepare(&sql).and_then(|mut stmt| {
            stmt.query_map(params_from_iter(content_ids.iter().copied()), |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        }) {
            for (id, title, is_completed) in rows {
                usages.push(ContextUsageData {
                    kind: "todo".to_string(),
                    key: format!("todo:{id}"),
                    title: if title.trim().is_empty() {
                        "未命名待办".to_string()
                    } else {
                        title
                    },
                    completed: Some(is_completed != 0),
                });
            }
        }

        let paths: Vec<String> = content_ids
            .iter()
            .map(|id| format!("note://{id}"))
            .collect();
        let path_marks = vec!["?"; paths.len()].join(",");
        let sql = format!(
            "SELECT DISTINCT p.id, p.title FROM vibe_learning_resources r
             JOIN vibe_learning_project p ON p.id = r.project_id
             WHERE r.source_type = 'note' AND r.original_path IN ({path_marks})
             ORDER BY p.update_time DESC LIMIT {CONTEXT_LIMIT}"
        );
        if let Ok(rows) = conn.prepare(&sql).and_then(|mut stmt| {
            stmt.query_map(params_from_iter(paths.iter().cloned()), |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>())
        }) {
            for (id, title) in rows {
                usages.push(ContextUsageData {
                    kind: "notebook".to_string(),
                    key: format!("notebook:{id}"),
                    title: if title.trim().is_empty() {
                        "未命名 Notebook".to_string()
                    } else {
                        title
                    },
                    completed: None,
                });
            }
        }
    }
    usages.truncate(CONTEXT_LIMIT);
    usages
}

/** content_ai_meta 的标题与摘要（桌面端后台预生成，随整库同步到达） */
fn ai_meta_summary_of(conn: &Connection, content_ids: &[i64]) -> Option<AiMetaSummary> {
    let content_id = *content_ids.first()?;
    let raw = conn
        .query_row(
            "SELECT meta FROM content_ai_meta WHERE content_id = ?1",
            params![content_id],
            |row| row.get::<_, String>(0),
        )
        .ok()?;
    let parsed = serde_json::from_str::<Value>(&raw).ok()?;
    let field = |name: &str| -> Option<String> {
        parsed
            .get(name)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    Some(AiMetaSummary {
        title: field("title"),
        summary: field("summary"),
    })
}

fn inline_link_sources(conn: &Connection, content_ids: &[i64]) -> Vec<String> {
    if content_ids.is_empty() {
        return vec![];
    }
    let marks = vec!["?"; content_ids.len()].join(",");
    let sql = format!(
        "SELECT content FROM contents WHERE id IN ({marks}) AND instr(content, '\"content-link\"') > 0"
    );
    conn.prepare(&sql)
        .and_then(|mut stmt| {
            stmt.query_map(params_from_iter(content_ids.iter().copied()), |row| {
                row.get::<_, Option<String>>(0)
            })
            .map(|rows| rows.filter_map(Result::ok).flatten().collect())
        })
        .unwrap_or_default()
}

fn open_index_connection(app: &AppHandle) -> Result<Connection, String> {
    let setting = load_or_init_setting(app)?;
    let db_name = get_active_database_name(&setting);
    super::index_db::open_index_database(app, &db_name)
}

#[tauri::command]
pub fn entity_context_get(
    app: AppHandle,
    kind: String,
    id: i64,
) -> Result<EntityContextResponse, String> {
    let kind = normalize_entity_kind(&kind)
        .ok_or_else(|| format!("ENTITY_CONTEXT_FAILED: 未知的实体类型：{kind}"))?;
    let conn = schema::open_active_database(&app)?;
    let self_entity = resolve_entity(&conn, &kind, id)
        .ok_or_else(|| format!("ENTITY_CONTEXT_FAILED: 实体不存在：{kind}:{id}"))?;

    let content_ids = content_ids_of_entity(&conn, &kind, id);
    let located = locate_all(&conn, &content_ids);
    let mut identities: Vec<EntityRefLite> = vec![EntityRefLite {
        kind: kind.clone(),
        id,
    }];
    let mut seen: HashSet<String> = identities.iter().map(|r| r.key()).collect();
    let mut projections: Vec<ContextEntityData> = Vec::new();
    for content_id in &content_ids {
        for other in located.get(content_id).into_iter().flatten() {
            let key = other.key();
            if seen.contains(&key) {
                continue;
            }
            seen.insert(key.clone());
            if let Some(entity) = resolve_entity(&conn, &other.kind, other.id) {
                identities.push(other.clone());
                if projections.len() < CONTEXT_LIMIT {
                    projections.push(entity);
                }
            }
        }
    }

    let links = explicit_links_of(&conn, &content_ids, &seen);
    let index_conn = open_index_connection(&app)?;
    let (backlinks, backlink_total) = backlinks_of(&conn, &index_conn, &kind, id, &content_ids);
    let questions = questions_of(&conn, &identities, &content_ids);
    let plugin_links = plugin_links_of(&conn, &identities);
    let sources = sources_of(&conn, &identities);
    let derived = derived_of(&conn, &identities, &content_ids);
    let notebook_projections = notebook_projections_of(&conn, &content_ids);
    let usages = usages_of(&conn, &content_ids);
    let ai_meta = ai_meta_summary_of(&conn, &content_ids);
    let inline_sources = inline_link_sources(&conn, &content_ids);

    Ok(EntityContextResponse {
        self_entity,
        self_content_ids: content_ids,
        links,
        projections,
        backlinks,
        backlink_total,
        questions,
        plugin_links,
        sources,
        derived,
        notebook_projections,
        usages,
        ai_meta,
        inline_sources,
    })
}

/** 批量解析实体的展示信息（前端合并内联引用时补身份用）；不存在的返回 null */
#[tauri::command]
pub fn entity_context_resolve_entities(
    app: AppHandle,
    payload: ResolveEntitiesPayload,
) -> Result<Vec<Option<ContextEntityData>>, String> {
    let conn = schema::open_active_database(&app)?;
    Ok(payload
        .refs
        .into_iter()
        .map(|input| {
            normalize_entity_kind(&input.kind)
                .and_then(|kind| resolve_entity(&conn, &kind, input.id))
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    const ENTITY_REFS_DDL: &str = "
        CREATE TABLE entity_refs (
          src_content_id INTEGER NOT NULL,
          src_block INTEGER NOT NULL DEFAULT 0,
          dst_kind TEXT NOT NULL,
          dst_id INTEGER NOT NULL,
          dst_content_id INTEGER,
          snippet_before TEXT NOT NULL DEFAULT '',
          snippet_label TEXT NOT NULL DEFAULT '',
          snippet_after TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE entity_ref_sources (
          content_id INTEGER PRIMARY KEY,
          update_time INTEGER NOT NULL
        );
        CREATE TABLE index_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
    ";

    fn main_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        super::super::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }

    fn index_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(ENTITY_REFS_DDL).unwrap();
        conn
    }

    fn insert_content(conn: &Connection, id: i64, update_time: i64, content: &str) {
        conn.execute(
            "INSERT INTO contents (id, create_time, update_time, content) VALUES (?1, ?2, ?2, ?3)",
            params![id, update_time, content],
        )
        .unwrap();
    }

    fn insert_card(conn: &Connection, id: i64, content_id: i64) {
        conn.execute(
            "INSERT INTO cards (id, create_time, update_time, content_id) VALUES (?1, 1, 1, ?2)",
            params![id, content_id],
        )
        .unwrap();
    }

    #[test]
    fn plugin_links_list_linking_plugin_entities_with_declared_label() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        insert_content(&conn, 20, 1, "[]");
        insert_content(&conn, 21, 1, "[]");
        insert_content(&conn, 22, 1, "[]");
        insert_card(&conn, 1, 10);
        conn.execute(
            "INSERT INTO plugin_entity_kinds (plugin_id, kind, label, update_time) VALUES ('tau.questions', 'question', '问题', 1)",
            [],
        )
        .unwrap();
        for (id, plugin, content, title, orphaned) in [
            (5i64, "tau.questions", 20i64, "为什么会这样", None::<i64>),
            (6, "tau.questions", 21, "", None),
            (7, "gone", 22, "已卸载", Some(1)),
        ] {
            conn.execute(
                "INSERT INTO plugin_entities (id, plugin_id, kind, key, title, content_id, create_time, update_time, orphaned_time)
                 VALUES (?1, ?2, 'question', ?1, ?3, ?4, 1, 1, ?5)",
                params![id, plugin, title, content, orphaned],
            )
            .unwrap();
        }
        let card_created: i64 = conn
            .query_row("SELECT create_time FROM cards WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        for (link, from, created, at) in [
            ("a", 5i64, card_created, 10i64),
            ("b", 6, card_created, 20),
            ("c", 7, card_created, 30),
            // 编号被复用前建立的关联
            ("d", 5, card_created - 1, 40),
        ] {
            conn.execute(
                "INSERT INTO plugin_links (id, plugin_id, from_id, to_kind, to_id, to_created_at, role, sort_index, create_time)
                 VALUES (?1, 'tau.questions', ?2, 'card', '1', ?3, ?1, 0, ?4)",
                params![link, from, created, at],
            )
            .unwrap();
        }
        let identities = vec![EntityRefLite {
            kind: "card".to_string(),
            id: 1,
        }];
        let linked = plugin_links_of(&conn, &identities);
        let rows: Vec<(i64, &str, Option<&str>)> = linked
            .iter()
            .map(|entity| {
                (
                    entity.id,
                    entity.title.as_str(),
                    entity.kind_label.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            rows,
            vec![
                (6, "无标题", Some("问题")),
                (5, "为什么会这样", Some("问题"))
            ]
        );
        // 插件内容自身的脉络不列出自己
        let own = vec![EntityRefLite {
            kind: "plugin-entity".to_string(),
            id: 5,
        }];
        conn.execute(
            "INSERT INTO plugin_links (id, plugin_id, from_id, to_kind, to_id, to_created_at, sort_index, create_time)
             VALUES ('e', 'tau.questions', 5, 'plugin-entity', '5', 1, 0, 50)",
            [],
        )
        .unwrap();
        assert!(plugin_links_of(&conn, &own).is_empty());
        // 共用正文时插件内容也是一个身份，排在正文实体之后
        let located = locate_all(&conn, &[20]);
        assert_eq!(located[&20][0].kind, "plugin-entity");
    }

    #[test]
    fn locate_all_orders_entities_by_priority() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        // 同一份正文被文章、项目文档、卡片共用：代表身份应是卡片
        conn.execute(
            "INSERT INTO articles (id, title, create_time, update_time, content_id) VALUES (3, '文章', 1, 1, 10)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO project_item (id, create_time, update_time, title, projects, content_id) VALUES (7, 1, 1, '文档', '[5]', 10)",
            [],
        )
        .unwrap();
        insert_card(&conn, 5, 10);
        let located = locate_all(&conn, &[10]);
        let kinds: Vec<&str> = located[&10].iter().map(|r| r.kind.as_str()).collect();
        assert_eq!(kinds, vec!["card", "article", "project-item"]);
    }

    #[test]
    fn explicit_links_exclude_self_and_locate_target_identity() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        insert_content(&conn, 20, 1, "[]");
        insert_card(&conn, 1, 10);
        insert_card(&conn, 2, 20);
        conn.execute(
            "INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (10, 20, 1)",
            [],
        )
        .unwrap();
        let mut exclude = HashSet::new();
        exclude.insert("card:1".to_string());
        let links = explicit_links_of(&conn, &[10], &exclude);
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].entity.id, 2);
        assert!(!links[0].inline_only);
        // 自连接不出现
        conn.execute(
            "INSERT INTO content_links (content_id, target_content_id, create_time) VALUES (10, 10, 2)",
            [],
        )
        .unwrap();
        let links = explicit_links_of(&conn, &[10], &exclude);
        assert_eq!(links.len(), 1);
    }

    #[test]
    fn backlinks_group_snippets_and_drop_unresolvable_sources() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        insert_content(&conn, 30, 5, "[]");
        insert_content(&conn, 40, 9, "[]");
        insert_card(&conn, 1, 10);
        insert_card(&conn, 9, 30);
        let index = index_db();
        // 来源 30（卡片 9）引用了 card:1 两次；来源 40 无身份（白板正文），应被丢弃
        for (label, block) in [("第一次", 0i64), ("第二次", 1)] {
            index
                .execute(
                    "INSERT INTO entity_refs (src_content_id, src_block, dst_kind, dst_id, snippet_before, snippet_label, snippet_after)
                     VALUES (30, ?1, 'card', 1, '前文', ?2, '后文')",
                    params![block, label],
                )
                .unwrap();
        }
        index
            .execute(
                "INSERT INTO entity_refs (src_content_id, dst_kind, dst_id, snippet_before, snippet_label, snippet_after)
                 VALUES (40, 'card', 1, 'a', 'b', 'c')",
                [],
            )
            .unwrap();
        let (backlinks, total) = backlinks_of(&conn, &index, "card", 1, &[10]);
        assert_eq!(total, 1);
        assert_eq!(backlinks.len(), 1);
        assert_eq!(backlinks[0].source.id, 9);
        assert_eq!(backlinks[0].snippets.len(), 2);
    }

    #[test]
    fn questions_map_target_types_and_answer_projection() {
        let conn = main_db();
        conn.execute(
            "INSERT INTO questions (id, create_time, update_time, question_content, status) VALUES (11, 1, 1, '问题甲', 'not_started')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO questions (id, create_time, update_time, question_content, status) VALUES (12, 1, 1, '问题乙', 'resolved')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO question_link (question_id, target_type, target_id, create_time) VALUES (11, 'card', 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO question_link (question_id, target_type, target_id, create_time) VALUES (12, 'answer', 10, 1)",
            [],
        )
        .unwrap();
        let identities = vec![EntityRefLite {
            kind: "card".to_string(),
            id: 1,
        }];
        let questions = questions_of(&conn, &identities, &[10]);
        let titles: Vec<&str> = questions.iter().map(|q| q.title.as_str()).collect();
        assert_eq!(titles.len(), 2);
        assert!(titles.contains(&"问题甲"));
        assert!(titles.contains(&"问题乙"));
    }

    #[test]
    fn sources_read_lineage_with_project_item_alias() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        insert_card(&conn, 1, 10);
        // 存量谱系存的是 project_item 写法，规范化后仍应命中
        conn.execute(
            "INSERT INTO entity_lineage (src_kind, src_id, dst_kind, dst_id, relation, create_time)
             VALUES ('project_item', '7', 'card', '1', 'derived', 100)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO project_item (id, create_time, update_time, title, content_id) VALUES (7, 1, 1, '来源文档', 77)",
            [],
        )
        .unwrap();
        let identities = vec![EntityRefLite {
            kind: "card".to_string(),
            id: 1,
        }];
        let sources = sources_of(&conn, &identities);
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].kind, "project-item");
        assert_eq!(sources[0].node_id, "7");
        assert_eq!(sources[0].title, "来源文档");
    }

    #[test]
    fn derived_includes_flashcard_references_edges() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        insert_card(&conn, 1, 10);
        conn.execute(
            "INSERT INTO flashcard_decks (id, name, create_time, update_time) VALUES (2, '默认卡组', 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO flashcards (id, deck_id, type, prompt, data, due_time, create_time, update_time)
             VALUES (3, 2, 'basic', '[{\"type\":\"paragraph\",\"children\":[{\"text\":\"闪卡提示\"}]}]', '{}', 0, 5, 5)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO flashcard_references (card_id, content_id, ref_type, title, create_time, update_time)
             VALUES (3, 10, 'note', 't', 5, 5)",
            [],
        )
        .unwrap();
        let identities = vec![EntityRefLite {
            kind: "card".to_string(),
            id: 1,
        }];
        let derived = derived_of(&conn, &identities, &[10]);
        assert_eq!(derived.len(), 1);
        assert_eq!(derived[0].kind, "flashcard");
        assert_eq!(derived[0].title, "闪卡提示");
        assert_eq!(derived[0].meta, "闪卡 · 默认卡组");
    }

    #[test]
    fn usages_cover_todo_and_notebook_resources() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[]");
        conn.execute(
            "INSERT INTO todo_item (id, group_id, title, is_completed, is_archived, create_time, update_time) VALUES (4, 1, '关联待办', 0, 0, 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO todo_note_link (todo_id, content_id, create_time, update_time) VALUES (4, 10, 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO vibe_learning_project (id, title, create_time, update_time) VALUES (5, '研究项目', 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO vibe_learning_resources (project_id, sort_index, create_time, update_time, name, original_path, resource_type, source_type)
             VALUES (5, 0, 1, 1, 'n', 'note://10', 'note', 'note')",
            [],
        )
        .unwrap();
        let usages = usages_of(&conn, &[10]);
        assert_eq!(usages.len(), 2);
        assert!(usages
            .iter()
            .any(|u| u.kind == "todo" && u.title == "关联待办" && u.completed == Some(false)));
        assert!(usages
            .iter()
            .any(|u| u.kind == "notebook" && u.title == "研究项目"));
    }

    #[test]
    fn resolve_entity_prefers_ai_title_and_falls_back_to_content() {
        let conn = main_db();
        insert_content(
            &conn,
            10,
            1,
            "[{\"type\":\"paragraph\",\"children\":[{\"text\":\"正文第一块\"}]}]",
        );
        insert_card(&conn, 1, 10);
        let entity = resolve_entity(&conn, "card", 1).unwrap();
        assert_eq!(entity.title, "正文第一块");
        conn.execute(
            "INSERT INTO content_ai_meta (content_id, schema_ver, text_digest, meta, model, create_time, update_time)
             VALUES (10, 1, 'd', '{\"title\":\"AI 标题\",\"summary\":\"AI 摘要\"}', 'm', 1, 1)",
            [],
        )
        .unwrap();
        let entity = resolve_entity(&conn, "card", 1).unwrap();
        assert_eq!(entity.title, "AI 标题");
        let meta = ai_meta_summary_of(&conn, &[10]).unwrap();
        assert_eq!(meta.title.as_deref(), Some("AI 标题"));
        assert_eq!(meta.summary.as_deref(), Some("AI 摘要"));
    }

    #[test]
    fn inline_sources_filtered_by_content_link_marker() {
        let conn = main_db();
        insert_content(&conn, 10, 1, "[{\"type\":\"content-link\"}]");
        insert_content(&conn, 20, 1, "[{\"type\":\"paragraph\"}]");
        insert_card(&conn, 1, 10);
        let sources = inline_link_sources(&conn, &[10, 20]);
        assert_eq!(sources.len(), 1);
        assert!(sources[0].contains("content-link"));
    }
}
