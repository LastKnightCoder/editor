use std::collections::HashMap;
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};
use super::operation::insert_operation;


#[derive(Serialize, Deserialize, Debug)]
pub struct TimeRecord {
    pub id: i64,
    pub date: String,
    pub cost: i64,
    pub content: String,
    pub event_type: String,
    pub time_type: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct TimeRecordGroup {
    pub date: String,
    pub time_records: Vec<TimeRecord>,
}

pub fn get_time_record_from_query_result(row: &Row) -> TimeRecord {
    TimeRecord {
        id: row.get(0).unwrap(),
        date: row.get(1).unwrap(),
        cost: row.get(2).unwrap(),
        content: row.get(3).unwrap(),
        event_type: row.get(4).unwrap(),
        time_type: row.get(5).unwrap(),
    }
}

pub fn init_time_record_table(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS time_records (
            id INTEGER PRIMARY KEY,
            date TEXT NOT NULL,
            cost INTEGER NOT NULL,
            content TEXT,
            event_type TEXT NOT NULL,
            time_type TEXT NOT NULL
        )",
        [],
    )?;
    Ok(())
}

pub fn create_time_record(
    conn: &Connection,
    date: &str,
    cost: i64,
    content: &str,
    event_type: &str,
    time_type: &str,
) -> Result<TimeRecord> {
    let mut stmt = conn.prepare("INSERT INTO time_records (date, cost, content, event_type, time_type) VALUES (?1, ?2, ?3, ?4, ?5)")?;
    let result = stmt.insert(params![date, cost, content, event_type, time_type])?;

    match insert_operation(conn, result as i64, "time_record".to_string(), "insert".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };

    // 在查询一次
    let mut stmt = conn.prepare("SELECT id, date, cost, content, event_type, time_type FROM time_records WHERE id = ?1")?;
    let mut rows = stmt.query(params![result])?;
    let row = rows.next()?.unwrap();
    Ok(get_time_record_from_query_result(&row))
}

pub fn update_time_record(
    conn: &Connection,
    id: i64,
    date: &str,
    cost: i64,
    content: &str,
    event_type: &str,
    time_type: &str,
) -> Result<TimeRecord> {
    let mut stmt = conn.prepare("UPDATE time_records SET date = ?1, cost = ?2, content = ?3, event_type = ?4, time_type = ?5 WHERE id = ?6")?;
    let result = stmt.execute(params![date, cost, content, event_type, time_type, id])?;

    match insert_operation(conn, result as i64, "time_record".to_string(), "update".to_string()) {
        Ok(_) => {}
        Err(e) => {
            println!("插入操作记录错误: {}", e);
        }
    };

    // 在查询一次
    let mut stmt = conn.prepare("SELECT id, date, cost, content, event_type, time_type FROM time_records WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_time_record_from_query_result(&row))
}

pub fn delete_time_record(
    conn: &Connection,
    id: i64,
) -> Result<usize> {
    let mut stmt = conn.prepare("DELETE FROM time_records WHERE id = ?1")?;
    let result = stmt.execute(params![id])?;
    Ok(result)
}

pub fn get_time_record_by_id(
    conn: &Connection,
    id: i64,
) -> Result<TimeRecord> {
    let mut stmt = conn.prepare("SELECT id, date, cost, content, event_type, time_type FROM time_records WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    let row = rows.next()?.unwrap();
    Ok(get_time_record_from_query_result(&row))
}

pub fn get_all_time_records(
    conn: &Connection,
) -> Result<Vec<TimeRecordGroup>> {
    let mut stmt = conn.prepare("SELECT id, date, cost, content, event_type, time_type FROM time_records ORDER BY date DESC")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    let mut map = HashMap::new();
    while let Some(row) = rows.next()? {
        let time_record = get_time_record_from_query_result(&row);
        let date = time_record.date.clone();
        if map.contains_key(&date) {
            let time_records: &mut Vec<TimeRecord> = map.get_mut(&date).unwrap();
            time_records.push(time_record);
        } else {
            let time_records = vec![time_record];
            map.insert(date, time_records);
        }
    }
    for (date, time_records) in map {
        res.push(TimeRecordGroup {
            date,
            time_records,
        });
    }
    Ok(res)
}

pub fn get_time_records_by_date(
    conn: &Connection,
    date: &str,
) -> Result<Vec<TimeRecord>> {
    let mut stmt = conn.prepare("SELECT id, date, cost, content, event_type, time_type FROM time_records WHERE date = ?1 ORDER BY date DESC")?;
    let mut rows = stmt.query(params![date])?;
    let mut res = Vec::new();
    while let Some(row) = rows.next()? {
        res.push(get_time_record_from_query_result(&row));
    }
    Ok(res)
}



// 按照日期分组
pub fn get_time_records_by_time_range(
    conn: &Connection,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<TimeRecordGroup>> {
    let mut stmt = conn.prepare("SELECT id, date, cost, content, event_type, time_type FROM time_records WHERE date >= ?1 AND date <= ?2 ORDER BY date DESC")?;
    let mut rows = stmt.query(params![start_date, end_date])?;
    let mut res = Vec::new();
    let mut map = HashMap::new();
    while let Some(row) = rows.next()? {
        let time_record = get_time_record_from_query_result(&row);
        let date = time_record.date.clone();
        if map.contains_key(&date) {
            let time_records: &mut Vec<TimeRecord> = map.get_mut(&date).unwrap();
            time_records.push(time_record);
        } else {
            let time_records = vec![time_record];
            map.insert(date, time_records);
        }
    }
    for (date, time_records) in map {
        res.push(TimeRecordGroup {
            date,
            time_records,
        });
    }
    Ok(res)
}

// 获取所有的事件类型，不能重复
pub fn get_all_event_types(
    conn: &Connection,
) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT event_type FROM time_records")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    // 首先判断已经存在，如果存在或者为空就不添加
    while let Some(row) = rows.next()? {
        let event_type: String = row.get(0)?;
        // 判断 res 是否有 event_type
        if !res.contains(&event_type) && event_type != "" {
            res.push(event_type);
        }
    }
    Ok(res)
}

// 获取所有的时间类型，不能重复
pub fn get_all_time_types(
    conn: &Connection,
) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT time_type FROM time_records")?;
    let mut rows = stmt.query(params![])?;
    let mut res = Vec::new();
    // 首先判断已经存在，如果存在或者为空就不添加
    while let Some(row) = rows.next()? {
        let time_type: String = row.get(0)?;
        // 判断 res 是否有 time_type
        if !res.contains(&time_type) && time_type != "" {
            res.push(time_type);
        }
    }
    Ok(res)
}
