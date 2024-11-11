use htmd::HtmlToMarkdown;

#[tauri::command]
pub fn html_to_markdown(html: String) -> Result<String, String> {
    let converter = HtmlToMarkdown::builder()
        .skip_tags(vec!["script", "style"])
        .build();
    let markdown = converter.convert(&html);
    match markdown {
        Ok(md) => Ok(md),
        Err(err) => Err(err.to_string())
    }
}
