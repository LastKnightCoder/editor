use std::collections::{HashMap, HashSet};
use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLease {
    pub lease_id: String,
    pub database_name: String,
    pub generation: u64,
}
#[derive(Default)]
struct State {
    generation: HashMap<String, u64>,
    leases: HashMap<String, LibraryLease>,
    runs: HashMap<String, HashSet<String>>,
    session_runs: HashMap<(String, String), (String, String)>,
    maintenance: HashSet<String>,
    switching: bool,
}
fn state() -> &'static Mutex<State> {
    static STATE: OnceLock<Mutex<State>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new(State::default()))
}
pub fn acquire(database_name: &str) -> Result<LibraryLease, String> {
    let mut state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    if state.switching || state.maintenance.contains(database_name) {
        return Err("AI_LIBRARY_BUSY:数据库正在维护".into());
    }
    let lease = LibraryLease {
        lease_id: uuid::Uuid::new_v4().to_string(),
        database_name: database_name.into(),
        generation: *state.generation.entry(database_name.into()).or_default(),
    };
    state.leases.insert(lease.lease_id.clone(), lease.clone());
    Ok(lease)
}
pub fn with_lease<T>(
    lease_id: &str,
    apply: impl FnOnce(&LibraryLease) -> Result<T, String>,
) -> Result<T, String> {
    let state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    let lease = state
        .leases
        .get(lease_id)
        .ok_or("AI_LIBRARY_CHANGED:库租约已失效")?;
    if state.switching || state.maintenance.contains(&lease.database_name) {
        return Err("AI_LIBRARY_BUSY:数据库正在维护".into());
    }
    apply(lease)
}
pub fn release(lease_id: &str) -> Result<(), String> {
    let mut state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    if state
        .runs
        .get(lease_id)
        .is_some_and(|runs| !runs.is_empty())
    {
        return Err("AI_LIBRARY_BUSY:请先停止并等待运行结束".into());
    }
    state.runs.remove(lease_id);
    state.leases.remove(lease_id);
    Ok(())
}
pub fn with_session<T>(
    lease_id: &str,
    session_id: &str,
    owner_can_write: bool,
    apply: impl FnOnce(&LibraryLease) -> Result<T, String>,
) -> Result<T, String> {
    let state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    let lease = state
        .leases
        .get(lease_id)
        .ok_or("AI_LIBRARY_CHANGED:库租约已失效")?;
    if state.switching || state.maintenance.contains(&lease.database_name) {
        return Err("AI_LIBRARY_BUSY:数据库正在维护".into());
    }
    if let Some((owner, _)) = state
        .session_runs
        .get(&(lease.database_name.clone(), session_id.into()))
    {
        if !owner_can_write || owner != lease_id {
            return Err("AI_SESSION_BUSY:会话正在运行".into());
        }
    }
    apply(lease)
}
pub fn run(
    lease_id: &str,
    run_id: &str,
    active: bool,
    session_id: Option<&str>,
) -> Result<(), String> {
    let mut state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    let lease = state
        .leases
        .get(lease_id)
        .ok_or("AI_LIBRARY_CHANGED:库租约已失效")?;
    if active && (state.switching || state.maintenance.contains(&lease.database_name)) {
        return Err("AI_LIBRARY_BUSY:数据库正在维护".into());
    }
    let database = lease.database_name.clone();
    if let Some(session_id) = session_id {
        let key = (database, session_id.into());
        if active {
            if state
                .session_runs
                .get(&key)
                .is_some_and(|(owner, run)| owner != lease_id || run != run_id)
            {
                return Err("AI_SESSION_BUSY:另一运行已经占用会话".into());
            }
            state
                .session_runs
                .insert(key, (lease_id.into(), run_id.into()));
        }
    }
    if !active {
        state
            .session_runs
            .retain(|_, (owner, run)| owner != lease_id || run != run_id);
    }
    let runs = state.runs.entry(lease_id.into()).or_default();
    if active {
        runs.insert(run_id.into());
    } else {
        runs.remove(run_id);
    }
    Ok(())
}
pub struct SwitchGuard;
impl Drop for SwitchGuard {
    fn drop(&mut self) {
        if let Ok(mut state) = state().lock() {
            state.switching = false;
        }
    }
}
pub fn begin_switch() -> Result<SwitchGuard, String> {
    let mut state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    if state.switching
        || !state.maintenance.is_empty()
        || state.runs.values().any(|runs| !runs.is_empty())
    {
        return Err("AI_LIBRARY_BUSY:AI 正在运行或数据库正在维护，请先结束任务".into());
    }
    state.switching = true;
    Ok(SwitchGuard)
}
pub fn invalidate_all() {
    let mut leases = Vec::new();
    if let Ok(mut state) = state().lock() {
        leases.extend(state.leases.keys().cloned());
        for generation in state.generation.values_mut() {
            *generation += 1;
        }
        state.leases.clear();
        state.runs.clear();
        state.session_runs.clear();
    }
    super::network::release_leases(&leases);
    super::cleanup_uploads(&leases);
}
pub fn invalidate_database(database: &str) {
    let mut leases = Vec::new();
    if let Ok(mut state) = state().lock() {
        *state.generation.entry(database.into()).or_default() += 1;
        for (id, lease) in &state.leases {
            if lease.database_name == database {
                leases.push(id.clone());
            }
        }
        for id in &leases {
            state.leases.remove(id);
            state.runs.remove(id);
        }
        state.session_runs.retain(|(name, _), _| name != database);
    }
    super::network::release_leases(&leases);
    super::cleanup_uploads(&leases);
}
pub struct Maintenance {
    database_name: String,
}
impl Drop for Maintenance {
    fn drop(&mut self) {
        if let Ok(mut state) = state().lock() {
            state.maintenance.remove(&self.database_name);
        }
    }
}
pub fn maintenance(database_name: &str) -> Result<Maintenance, String> {
    let mut state = state()
        .lock()
        .map_err(|_| "AI_STORAGE_FAILED:库租约不可用")?;
    if state.switching
        || state.maintenance.contains(database_name)
        || state.leases.iter().any(|(id, lease)| {
            lease.database_name == database_name
                && state.runs.get(id).is_some_and(|runs| !runs.is_empty())
        })
    {
        return Err("AI_LIBRARY_BUSY:AI 会话正在运行".into());
    }
    state.maintenance.insert(database_name.into());
    Ok(Maintenance {
        database_name: database_name.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn busy_run_blocks_maintenance_and_old_lease_is_invalidated() {
        let database = format!("{}.db", uuid::Uuid::new_v4());
        let lease = acquire(&database).unwrap();
        run(&lease.lease_id, "run", true, None).unwrap();
        assert!(maintenance(&database).is_err());
        run(&lease.lease_id, "run", false, None).unwrap();
        let guard = maintenance(&database).unwrap();
        assert!(with_lease(&lease.lease_id, |_| Ok(())).is_err());
        drop(guard);
        release(&lease.lease_id).unwrap();
        assert!(with_lease(&lease.lease_id, |_| Ok(())).is_err());
    }
    #[test]
    fn same_session_cannot_run_or_be_edited_through_another_lease() {
        let database = format!("{}.db", uuid::Uuid::new_v4());
        let first = acquire(&database).unwrap();
        let second = acquire(&database).unwrap();
        run(&first.lease_id, "run-1", true, Some("session")).unwrap();
        assert!(run(&second.lease_id, "run-2", true, Some("session")).is_err());
        assert!(with_session(&second.lease_id, "session", true, |_| Ok(())).is_err());
        assert!(with_session(&first.lease_id, "session", false, |_| Ok(())).is_err());
        with_session(&first.lease_id, "session", true, |_| Ok(())).unwrap();
        run(&first.lease_id, "run-1", false, Some("session")).unwrap();
        run(&second.lease_id, "run-2", true, Some("session")).unwrap();
        run(&second.lease_id, "run-2", false, Some("session")).unwrap();
        release(&first.lease_id).unwrap();
        release(&second.lease_id).unwrap();
    }
}
