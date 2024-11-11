use openai_api_rust::*;
use openai_api_rust::chat::*;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[tauri::command(async)]
pub fn chat(api_key: String, base_url: String, model: String, messages: Vec<Message>) -> Result<String, String> {
    let auth = Auth::new(&api_key);
    let client = OpenAI::new(auth, &base_url);
    let body = ChatBody {
        model,
        max_tokens: None,
        temperature: Some(0_f32),
        top_p: Some(0_f32),
        n: Some(1),
        stream: Some(false),
        stop: None,
        presence_penalty: None,
        frequency_penalty: None,
        logit_bias: None,
        user: None,
        messages,
    };
    let rs = client.chat_completion_create(&body);
    match rs {
        Ok(rs) => {
            let choice = rs.choices;
            match &choice[0].message.as_ref() {
                Some(message) => {
                    Ok(message.content.clone())
                }
                None => Err("no message found".to_string())
            }
        }
        Err(e) => Err(e.to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("llm")
        .invoke_handler(tauri::generate_handler![
            chat
        ])
        .build()
}
