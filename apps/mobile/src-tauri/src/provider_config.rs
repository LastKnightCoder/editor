pub fn is_http_url(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.starts_with("http://") || trimmed.starts_with("https://")
}

pub fn is_empty_or_http_url(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.is_empty() || is_http_url(trimmed)
}

pub fn normalize_url_style(url_style: &str) -> String {
    if url_style.trim() == "virtualHosted" {
        "virtualHosted".to_string()
    } else {
        "path".to_string()
    }
}
