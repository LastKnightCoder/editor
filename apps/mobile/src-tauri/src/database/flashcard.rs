// 闪卡数据库命令 facade。具体实现按职责拆分到各子模块，保持导出路径与 command 名称不变。

#[path = "flashcard_cards.rs"]
mod flashcard_cards;
#[path = "flashcard_common.rs"]
mod flashcard_common;
#[path = "flashcard_decks.rs"]
mod flashcard_decks;
#[path = "flashcard_review.rs"]
mod flashcard_review;
#[path = "flashcard_schedule.rs"]
mod flashcard_schedule;
#[path = "flashcard_types.rs"]
mod flashcard_types;

pub use flashcard_cards::*;
pub use flashcard_decks::*;
pub use flashcard_review::*;

#[tauri::command]
pub fn plugin_flashcards(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    token: String,
    database: String,
    plugin_id: String,
    method: String,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    crate::plugin_transport::window_allowed(&window)?;
    crate::provider_settings::validate_plugin_id(&plugin_id)?;
    let result = crate::plugin_transport::with_database(&token, &database, || {
        let mut conn = crate::database::schema::open_active_database(&app)?;
        if conn.database_name() != database {
            return Err("插件工作区已失效".into());
        }
        plugin_call(&mut conn, &method, payload)
    })?;
    if method != "listDecks" {
        crate::database::reconcile::trigger_reconcile(&app, &database);
    }
    Ok(result)
}

fn plugin_call(
    conn: &mut rusqlite::Connection,
    method: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    match method {
        "listDecks" => serde_json::to_value(flashcard_decks::list_decks(conn)?),
        "createDeck" => serde_json::to_value(flashcard_decks::create_deck(
            conn,
            serde_json::from_value(payload).map_err(|e| e.to_string())?,
        )?),
        "createCard" => serde_json::to_value(flashcard_cards::create_card(
            conn,
            serde_json::from_value(payload).map_err(|e| e.to_string())?,
        )?),
        _ => return Err("移动端尚未开放此闪卡操作".into()),
    }
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod plugin_tests {
    use super::*;
    use serde_json::json;

    fn database() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        crate::database::migrator::ensure_main_schema(&conn).unwrap();
        conn
    }
    fn deck(conn: &mut rusqlite::Connection) -> i64 {
        plugin_call(conn, "createDeck", json!({"name":"学习"})).unwrap()["id"]
            .as_i64()
            .unwrap()
    }
    #[test]
    fn plugin_flashcard_decks_and_cards_stay_in_given_database() {
        let mut first = database();
        let mut second = database();
        let id = deck(&mut first);
        let card = plugin_call(
            &mut first,
            "createCard",
            json!({"deckId":id,"type":"qa","prompt":[],"data":{"answer":"答案"}}),
        )
        .unwrap();
        assert_eq!(card["deckId"], id);
        assert_eq!(
            plugin_call(&mut second, "listDecks", json!({})).unwrap(),
            json!([])
        );
        assert!(plugin_call(
            &mut second,
            "createCard",
            json!({"deckId":id,"type":"qa","prompt":[]})
        )
        .is_err());
        assert!(plugin_call(&mut first, "generate", json!({})).is_err());
    }
    #[test]
    fn plugin_flashcard_reference_identity_failure_rolls_back_card_and_counts() {
        let mut conn = database();
        let id = deck(&mut conn);
        conn.execute("INSERT INTO contents(id,create_time,update_time,content,count,ref_count) VALUES(1,10,10,'[]',0,1)", []).unwrap();
        let input = json!({"deckId":id,"type":"qa","prompt":[],"references":[{"refType":"content","contentId":1,"contentCreatedAt":10,"title":"正确"},{"refType":"content","contentId":1,"contentCreatedAt":11,"title":"旧身份"}]});
        assert!(plugin_call(&mut conn, "createCard", input)
            .unwrap_err()
            .contains("身份"));
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM flashcards", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row("SELECT ref_count FROM contents WHERE id=1", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            1
        );
    }
    #[test]
    fn plugin_flashcard_custom_reference_owns_a_new_content_record() {
        let mut conn = database();
        let id = deck(&mut conn);
        let card = plugin_call(&mut conn, "createCard", json!({"deckId":id,"type":"qa","prompt":[],"references":[{"refType":"custom","customContent":[],"contracts":{},"count":0,"title":"资料"}]})).unwrap();
        assert_eq!(card["references"][0]["refType"], "custom");
        assert_eq!(
            conn.query_row("SELECT ref_count FROM contents", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
