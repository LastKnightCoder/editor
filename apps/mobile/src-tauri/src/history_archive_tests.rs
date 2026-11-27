use super::*;
use crate::content_history::{self, ContentHistoryWrite};

struct TempDir(std::path::PathBuf);
impl TempDir {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!("tau-history-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn path(&self) -> &Path {
        &self.0
    }
}
impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn edit(
    operation: &str,
    checkpoint: Option<&[u8]>,
    merge: Option<(&str, &[u8])>,
) -> ContentHistoryWrite {
    serde_json::from_value(
        json!({"operationId":operation,"checkpoint":checkpoint.map(|b|STANDARD.encode(b)),
        "mergeInto":merge.map(|m|m.0),"mergedState":merge.map(|m|STANDARD.encode(m.1))}),
    )
    .unwrap()
}
fn metadata() -> Value {
    json!({"mode":"local","baselineId":"mobile-session","source":{"librarySourceId":"library","contentDocumentId":"article"}})
}

#[test]
fn downgraded_reader_keeps_the_local_undo_target() {
    let db = Connection::open_in_memory().unwrap();
    content_history::prepare(&db).unwrap();
    content_history::record(&db, &metadata(), b"start", true, None).unwrap();
    content_history::record(
        &db,
        &metadata(),
        b"edit",
        false,
        Some(&edit("first", None, None)),
    )
    .unwrap();
    let undo:ContentHistoryWrite=serde_json::from_value(json!({
       "operationId":"undo-local","kind":"undo","targetVersion":"op:first","targetOperationId":"first"
    })).unwrap();
    content_history::record(&db, &metadata(), b"undo", false, Some(&undo)).unwrap();
    let local:i64=db.query_row("SELECT json_extract(metadata,'$.target') FROM local_content_history WHERE operation_id='undo-local'",[],|r|r.get(0)).unwrap();
    assert_eq!(local, 1);
    let remote:ContentHistoryWrite=serde_json::from_value(json!({
       "operationId":"restore-remote","kind":"restore","targetVersion":"base:other","targetOperationId":"baseline:0"
    })).unwrap();
    content_history::record(&db, &metadata(), b"restore", false, Some(&remote)).unwrap();
    let target:Option<i64>=db.query_row("SELECT json_extract(metadata,'$.target') FROM local_content_history WHERE operation_id='restore-remote'",[],|r|r.get(0)).unwrap();
    assert_eq!(target, None);
}

#[test]
fn persisted_replay_budget_survives_reopen_and_failed_checkpoint() {
    let dir = TempDir::new();
    let path = dir.path().join("cache.db");
    let conn = Connection::open(&path).unwrap();
    content_history::prepare(&conn).unwrap();
    content_history::record(&conn, &metadata(), b"start", true, None).unwrap();
    let half = vec![1u8; 512 * 1024];
    content_history::record(
        &conn,
        &metadata(),
        &half,
        false,
        Some(&edit("first", None, None)),
    )
    .unwrap();
    drop(conn);
    let conn = Connection::open(&path).unwrap();
    let merged = vec![2u8; 1024 * 1024];
    let attempt = edit("next", None, Some(("first", &merged)));
    assert_eq!(
        content_history::record(&conn, &metadata(), &half, false, Some(&attempt)).unwrap_err(),
        "HISTORY_CHECKPOINT_REQUIRED"
    );
    let row = || {
        conn.query_row("SELECT operation_id,sequence,checkpoint,state FROM local_content_history ORDER BY sequence DESC LIMIT 1",[],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,i64>(2)?,r.get::<_,Vec<u8>>(3)?))).unwrap()
    };
    assert_eq!(row(), ("first".into(), 1, 0, half.clone()));
    let retry = edit("next", Some(b"full"), Some(("first", &merged)));
    content_history::record(&conn, &metadata(), &half, false, Some(&retry)).unwrap();
    assert_eq!(row(), ("next".into(), 1, 1, b"full".to_vec()));
    let strict:ContentHistoryWrite=serde_json::from_value(json!({
        "operationId":"stale","mergeInto":"first","mergedState":STANDARD.encode(b"stale"),"strictGroup":true
    })).unwrap();
    assert_eq!(
        content_history::record(&conn, &metadata(), b"stale", false, Some(&strict)).unwrap_err(),
        "HISTORY_GROUP_CHANGED"
    );
    assert_eq!(row(), ("next".into(), 1, 1, b"full".to_vec()));
    for i in 2..129 {
        content_history::record(
            &conn,
            &metadata(),
            b"d",
            false,
            Some(&edit(&format!("n-{i}"), None, None)),
        )
        .unwrap();
    }
    assert_eq!(
        content_history::record(
            &conn,
            &metadata(),
            b"d",
            false,
            Some(&edit("last", None, None))
        )
        .unwrap_err(),
        "HISTORY_CHECKPOINT_REQUIRED"
    );
    content_history::record(
        &conn,
        &metadata(),
        b"d",
        false,
        Some(&edit("last", Some(b"last snapshot"), None)),
    )
    .unwrap();
    assert_eq!(row(), ("last".into(), 129, 129, b"last snapshot".to_vec()));
}

// Desktop generates real Yjs updates and verifies the returned archive with its production reader.
#[test]
#[ignore = "run between the desktop history exchange writer and reader"]
fn exchange_desktop_mobile_library() {
    let folder = std::path::PathBuf::from(std::env::var("TAU_HISTORY_EXCHANGE").unwrap());
    let mut db = Connection::open(folder.join("library.db")).unwrap();
    let directory = TempDir::new();
    let path = directory.path().join("legacy-phone.db");
    let conn = Connection::open(&path).unwrap();
    content_history::prepare(&conn).unwrap();
    let updates: Vec<String> =
        serde_json::from_slice(&std::fs::read(folder.join("updates.json")).unwrap()).unwrap();
    for (i, encoded) in updates.iter().enumerate() {
        let bytes = STANDARD.decode(encoded).unwrap();
        content_history::record(
            &conn,
            &metadata(),
            &bytes,
            i == 0,
            Some(&edit(&format!("phone-{i}"), None, None)),
        )
        .unwrap();
    }
    drop(conn);
    let desktop_versions: i64 = db
        .query_row("SELECT count(*) FROM content_history_versions", [], |r| {
            r.get(0)
        })
        .unwrap();
    capture(&mut db, &path, None, true, None).unwrap();
    capture(&mut db, &path, None, false, None).unwrap();
    let versions = read_versions(&db, "article", None, None).unwrap();
    let all = versions.as_array().unwrap();
    let phone = all.iter().find(|r| r["operationId"] == "phone-3").unwrap();
    let read = read_versions(&db, "article", None, phone["sequence"].as_i64()).unwrap();
    assert_eq!(read["updates"], json!(updates));
    let first: i64 = db
        .query_row(
            "SELECT sequence FROM content_history_versions WHERE version_key='op:A-0'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let desktop = read_versions(&db, "article", None, Some(first)).unwrap();
    assert_eq!(desktop["entry"]["operationId"], "A-0");
    db.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").unwrap();
    std::fs::write(
        folder.join("receipt.json"),
        serde_json::to_vec(
            &json!({"desktopVersions":desktop_versions,"desktopUpdates":desktop["updates"]}),
        )
        .unwrap(),
    )
    .unwrap();
}
