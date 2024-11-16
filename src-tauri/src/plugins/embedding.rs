use openai_api_rust::{Auth, OpenAI};
use openai_api_rust::embeddings::{EmbeddingsBody, EmbeddingsApi};
use text_splitter::{ChunkConfig, MarkdownSplitter};
use tiktoken_rs::cl100k_base;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[tauri::command]
pub fn markdown_spilt(text: String) -> Vec<String> {
    let tokenizer = cl100k_base().unwrap();
    let max_tokens = 500..2000;
    let splitter = MarkdownSplitter::new(ChunkConfig::new(max_tokens).with_sizer(tokenizer));

    let chunks = splitter.chunks(&text);
    // 将 chunks 转为 Vec<String>
    let result = chunks.collect::<Vec<_>>();
    // 转为 String
    return result.iter().map(|s| s.to_string()).collect();
}

#[tauri::command(async)]
pub fn embedding_openai(api_key: String, base_url: String, model: String, input: String) -> Result<Vec<f64>, String> {
    let auth = Auth::new(&api_key);
    let client = OpenAI::new(auth, &base_url);
    let body = EmbeddingsBody {
        model,
        input: vec![input],
        user: None,
    };

    let rs = client.embeddings_create(&body);

    match rs {
        Ok(rs) => {
            let embeddings = rs.data;
            match embeddings {
                Some(embeddings) => {
                    let embedding = embeddings.get(0);
                    match embedding {
                        Some(embedding) => {
                            let f = embedding.embedding.clone();
                            match f {
                                Some(f) => Ok(f),
                                None => Err("No embedding found".to_string())
                            }
                        },
                        None => Err("No embedding found".to_string())
                    }
                },
                None => Err("No embeddings found".to_string())
            }
        },
        Err(e) => Err(e.to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("embedding")
        .invoke_handler(tauri::generate_handler![
            embedding_openai,
            markdown_spilt
        ])
        .build()
}
