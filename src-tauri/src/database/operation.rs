use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};
use chrono::prelude::*;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Operation {
    pub id: i64,
    pub operation_time: i64,
    pub operation_content_type: String,
    pub operation_action: String,
    pub operation_id: i64,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OperationRecord {
    pub time: String,
    pub operation_list: Vec<Operation>,
}

pub fn get_operation_from_query_result(row: &Row) -> Operation {
    Operation {
        id: row.get(0).unwrap(),
        operation_time: row.get(1).unwrap(),
        operation_id: row.get(2).unwrap(),
        operation_content_type: row.get(3).unwrap(),
        operation_action: row.get(4).unwrap(),
    }
}

pub fn init_operation_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS operation (
            id INTEGER PRIMARY KEY,
            operation_time INTEGER NOT NULL,
            operation_id INTEGER,
            operation_content_type TEXT,
            operation_action TEXT
        )",
        [],
    )?;
    Ok(())
}

pub fn upgrade_operation_table(_conn: &Connection, old_version: i64, new_version: i64) -> Result<()> {
    if old_version == new_version {
        return Ok(());
    }
    // 多版本渐进式升级
    match old_version {
        _ => {}
    }
    Ok(())
}

pub fn insert_operation(conn: &Connection, operation_id: i64, operation_content_type: String, operation_action: String) -> Result<()> {
    let operation_time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    conn.execute(
        "INSERT INTO operation (operation_id, operation_time, operation_content_type, operation_action) VALUES (?1, ?2, ?3, ?4)",
        params![operation_id, operation_time, operation_content_type, operation_action],
    )?;
    Ok(())
}

pub fn get_operation_list(conn: &Connection) -> Result<Vec<Operation>> {
    let mut stmt = conn.prepare("SELECT id, operation_time, operation_id, operation_content_type, operation_action FROM operation ORDER BY operation_time DESC")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_operation_from_query_result(&row));
    }
    Ok(res)
}

pub fn get_date_from_timestamp(timestamp: i64) -> String {
    let time = SystemTime::UNIX_EPOCH + std::time::Duration::from_millis(timestamp as u64);
    let datetime = chrono::DateTime::<chrono::Utc>::from(time);
    datetime.format("%Y-%m-%d").to_string()
}

// 获取某年的所有操作记录
// 按照 operation_id 和 operation_content_type 按天去重，即 operation_id 和 operation_content_type 在同一天相同的记录只保留一条
// 其中 operation_time 是时间戳，根据 operation_time 升序
pub fn get_operation_records_by_year(conn: &Connection, year: String) -> Result<Vec<OperationRecord>> {
    let sql = format!("SELECT id, operation_time, operation_id, operation_content_type, operation_action FROM operation WHERE operation_time >= ?1 AND operation_time < ?2 ORDER BY operation_time");
    let mut stmt = conn.prepare(&sql)?;
    let start_time = format!("{}-01-01 00:00:00", year);
    let end_time = format!("{}-01-01 00:00:00", year.parse::<i32>().unwrap() + 1);
    let start_time = NaiveDateTime::parse_from_str(&start_time, "%Y-%m-%d %H:%M:%S").unwrap().timestamp() * 1000;
    let end_time = NaiveDateTime::parse_from_str(&end_time, "%Y-%m-%d %H:%M:%S").unwrap().timestamp() * 1000;
    let mut rows = stmt.query(params![start_time, end_time])?;
    let mut res = Vec::new();
    let mut operation_list = Vec::new();
    let mut last_date = String::new();
    while let Some(row) = rows.next()? {
        let operation = get_operation_from_query_result(&row);
        let date = get_date_from_timestamp(operation.operation_time);
        if last_date == date {
            operation_list.push(operation);
        } else {
            if operation_list.len() > 0 {
                res.push(OperationRecord {
                    time: last_date,
                    operation_list,
                });
            }
            operation_list = Vec::new();
            operation_list.push(operation);
            last_date = date;
        }
    }
    if operation_list.len() > 0 {
        res.push(OperationRecord {
            time: last_date,
            operation_list: operation_list,
        });
    }

    // 每一组都要根据 operation_id 和 operation_content_type 去重，
    // 去重的条件是 operation_id 和 operation_content_type 不同时相同，保留最后一条
    // operation_id 和 operation_content_type 相同的记录，只保留一条，但是这个列表是无序的，id 相同可能不相邻
    // 建议先按照 operation_content_type 分组，然后根据 operation_id 去重，最后恢复
    // 代码如下：
    #[derive(Debug)]
    struct OperationRecordGroupByContentType {
        pub time: String,
        // 键就是 operation_content_type
        pub map: HashMap<String, Vec<Operation>>,
    }

    let mut operation_record_group_by_content_type_list: Vec<OperationRecordGroupByContentType> = Vec::new();
    for operation_record in res {
        let mut map: HashMap<String, Vec<Operation>> = HashMap::new();
        for operation in operation_record.operation_list {
            let operation_content_type = operation.operation_content_type.clone();
            if map.contains_key(&operation_content_type) {
                let operation_list = map.get_mut(&operation_content_type).unwrap();
                let mut index = 0;
                let mut found = false;
                for i in 0..operation_list.len() {
                    if operation_list[i].operation_id == operation.operation_id {
                        found = true;
                        index = i;
                        break;
                    }
                }
                if found {
                    operation_list.remove(index);
                }
                operation_list.push(operation);
            } else {
                map.insert(operation_content_type, vec![operation]);
            }
        }
        operation_record_group_by_content_type_list.push(OperationRecordGroupByContentType {
            time: operation_record.time,
            map,
        });
    }

    let mut res2 = Vec::new();
    for operation_record_group_by_content_type in operation_record_group_by_content_type_list {
        let mut operation_list = Vec::new();
        for (_, v) in operation_record_group_by_content_type.map {
            operation_list.append(&mut v.clone());
        }
        res2.push(OperationRecord {
            time: operation_record_group_by_content_type.time,
            operation_list,
        });
    };

    Ok(res2)
}