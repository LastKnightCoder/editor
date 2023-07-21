use std::time::{SystemTime, UNIX_EPOCH};
use rusqlite::{Connection, params, Result, Row};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct Article {
    pub id: i64,
    pub create_time: i64,
    pub update_time: i64,
    pub title: String,
    pub tags: Vec<String>,
    pub content: String,
}