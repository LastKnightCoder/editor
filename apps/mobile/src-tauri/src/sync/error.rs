#[derive(Debug, Clone)]
pub(crate) struct AppError {
    pub(crate) code: String,
    pub(crate) message: String,
}

impl AppError {
    pub(crate) fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}
