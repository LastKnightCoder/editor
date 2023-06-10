use rusqlite::Connection;

pub struct AppState {
    pub db: std::sync::Mutex<Option<Connection>>,
}


