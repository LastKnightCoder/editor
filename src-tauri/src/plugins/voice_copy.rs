use hmac::Mac;
use chrono::{DateTime, Utc};
use hmac::Hmac;
use http::{HeaderMap, Method};
use reqwest::Client;
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

const SERVICE: &str = "speech_saas_prod";
const VERSION: &str = "2023-11-07";
const REGION: &str = "cn-north-1";
const ACTION: &str = "ListMegaTTSTrainStatus";

const HOST: &str = "open.volcengineapi.com";
const SPEECH_HOST: &str = "openspeech.bytedance.com";

const CONTENT_TYPE: &str = "application/json; charset=utf-8";

// sha256 非对称加密
fn hmac_sha256(key: &[u8], content: &str) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("Invalid key length");
    mac.update(content.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

// sha256 hash 算法
fn hash_sha256(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

// 规范化查询参数
fn norm_query(params: &std::collections::HashMap<String, String>) -> String {
    let mut query = String::new();
    let mut keys: Vec<_> = params.keys().cloned().collect();
    keys.sort();
    for key in keys {
        if let Some(values) = params.get(&key) {
            if values.contains(',') {
                for value in values.split(',') {
                    query.push_str(&format!(
                        "{}={}&",
                        urlencoding::encode(&key).replace("+", "%20"),
                        urlencoding::encode(&value).replace("+", "%20")
                    ));
                }
            } else {
                query.push_str(&format!(
                    "{}={}&",
                    urlencoding::encode(&key).replace("+", "%20"),
                    urlencoding::encode(values).replace("+", "%20")
                ));
            }
        }
    }
    query.pop();
    query
}

async fn sign_request(
    access_token: &str,
    secret_key: &str,
    method: Method,
    date: DateTime<Utc>,
    query: std::collections::HashMap<String, String>,
    header: HeaderMap,
    body: String,
) -> Result<String, String> {
    let x_date = date.format("%Y%m%dT%H%M%SZ").to_string();
    let short_x_date = &x_date[..8];
    let x_content_sha256 = hash_sha256(&body);

    let mut sign_result = HeaderMap::new();
    sign_result.insert("Host", HOST.parse().unwrap());
    sign_result.insert("X-Content-Sha256", x_content_sha256.parse().unwrap());
    sign_result.insert("X-Date", x_date.parse().unwrap());
    sign_result.insert("Content-Type", CONTENT_TYPE.parse().unwrap());

    let sign = format!(
        "{}\n{}\n{}\n{}",
        format!("content-type:{}", CONTENT_TYPE),
        format!("host:{}", HOST),
        format!("x-content-sha256:{}", x_content_sha256),
        format!("x-date:{}", x_date)
    );

    let signed_headers_str = "content-type;host;x-content-sha256;x-date";
    let canonical_request_str = format!(
        "{}\n{}\n{}\n{}\n\n{}\n{}",
        method.as_str().to_uppercase(),
        "/",
        norm_query(&query),
        sign,
        signed_headers_str,
        x_content_sha256
    );
    let hashed_canonical_request = hash_sha256(&canonical_request_str);
    let credential_scope = format!("{}/{}/{}/request", short_x_date, REGION, SERVICE);
    let string_to_sign = format!(
        "HMAC-SHA256\n{}\n{}\n{}",
        x_date, credential_scope, hashed_canonical_request
    );

    let k_date = hmac_sha256(secret_key.as_bytes(), short_x_date);
    let k_region = hmac_sha256(&k_date, REGION);
    let k_service = hmac_sha256(&k_region, SERVICE);
    let k_signing = hmac_sha256(&k_service, "request");
    let signature = hmac_sha256(&k_signing, &string_to_sign).iter().map(|b| format!("{:02x}", b)).collect::<String>();
    sign_result.insert(
        "Authorization",
        format!(
            "HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            access_token,
            credential_scope,
            signed_headers_str,
            signature
        )
            .parse()
            .unwrap(),
    );

    let mut final_header = header.clone();
    for (k, v) in sign_result {
        if let Some(k) = k {
            final_header.insert(k, v);
        }
    }

    let client = Client::new();
    let url = format!("https://{}{}", HOST, "/");
    let response = client
        .request(method, url)
        .headers(final_header)
        .query(&query)
        .body(body)
        .send()
        .await;

    match response {
        Ok(response) => {
            let response_text = response.text().await;
            return match response_text {
                Ok(text) => Ok(text),
                Err(error) => Err(error.to_string()),
            }
        },
        Err(error) => {
            println!("Error: {}", error);
            Err(error.to_string())
        }
    }
}

#[derive(Serialize, Deserialize)]
struct QueryBody {
    appid: String,
}

#[tauri::command]
pub async fn get_all_speaker_list(access_token: &str, secret_key: &str, appid: &str) -> Result<String, String> {
    let method = Method::POST;
    let date = Utc::now();

    let mut query_params = std::collections::HashMap::new();
    query_params.insert("Action".to_string(), ACTION.to_string());
    query_params.insert("Version".to_string(), VERSION.to_string());
    query_params.insert("Region".to_string(), REGION.to_string());

    let header = HeaderMap::new();
    let body = QueryBody {
        appid: appid.to_string(),
    };

    Ok(sign_request(access_token, secret_key, method, date, query_params, HeaderMap::new(), serde_json::to_string(&body).unwrap()).await?)
}

#[derive(Serialize, Deserialize)]
struct AudioInfo<'a> {
    // base64 编码的音频数据
    audio_bytes: &'a str,
    audio_format: Option<&'a str>,
}

#[derive(Serialize, Deserialize)]
struct UploadAudioBody<'a> {
    appid: &'a str,
    speaker_id: &'a str,
    audios: Vec<AudioInfo<'a>>,
    source: u8,
    language: Option<u8>,
    model_type: Option<u8>,
    cluster: Option<&'a str>,
}

#[tauri::command]
pub async fn train_speaker(appid: &str, token: &str, speaker_id: &str, audio: &str) -> Result<String, String> {
    let path = "api/v1/mega_tts/audio/upload";
    let authorization = format!("Bearer;{}", token);

    let mut headers: HeaderMap = HeaderMap::new();
    headers.insert("Authorization", authorization.parse().unwrap());
    headers.insert("Resource-Id", "volc.megatts.voiceclone".parse().unwrap());
    headers.insert("Content-Type", "application/json".parse().unwrap());

    let body = UploadAudioBody {
        appid,
        speaker_id,
        audios: vec![AudioInfo {
            audio_bytes: audio,
            audio_format: Some("mp3"),
        }],
        source: 2,
        language: Some(0),
        model_type: Some(1),
        cluster: Some("volcano_icl")
    };

    let client = Client::new();
    let response = client
        .post(format!("https://{}/{}", SPEECH_HOST, path))
        .headers(headers)
        .body(serde_json::to_string(&body).unwrap())
        .send()
        .await;

    match response {
        Ok(response) => {
            let text = response.text().await;
            Ok(text.unwrap_or_else(|error| error.to_string()))
        },
        Err(error) => {
            Err(error.to_string())
        }
    }
}

#[derive(Serialize, Deserialize)]
struct TTSApp {
    appid: String,
    token: String,
    cluster: String,
}

#[derive(Serialize, Deserialize)]
struct TTSUser {
    uid: String, // 任意非空字符串，服务端日志查询
}

#[derive(Serialize, Deserialize)]
struct TTSAudio {
    voice_type: String, // speaker_id
    encoding: Option<String>, // default pcm, mp3 & pcm & ...
}

#[derive(Serialize, Deserialize)]
struct TTSRequest {
    text: String,
    reqid: String, // 需要保证每次调用传入值唯一，建议使用 UUID
    text_type: Option<String>, // plain & ssml
    operation: String, // query & submit
}

#[derive(Serialize, Deserialize)]
struct TTSBody {
    app: TTSApp,
    user: TTSUser,
    audio: TTSAudio,
    request: TTSRequest,
}

#[derive(Debug, Serialize, Deserialize)]
struct TTSResponseAddition {
    duration: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TTSResponse {
    pub code: i32,
    pub reqid: String,
    pub message: String,
    pub operation: String,
    pub sequence: i32,
    pub data: Option<String>,
    pub addition: Option<TTSResponseAddition>,
}

#[tauri::command]
pub async fn text_to_speech(appid: &str, token: &str, speaker_id: &str, text: &str) -> Result<String, String> {
    let path = "api/v1/tts";
    let authorization = format!("Bearer;{}", token);

    let mut headers: HeaderMap = HeaderMap::new();
    headers.insert("Authorization", authorization.parse().unwrap());

    let uuid = Uuid::new_v4();
    let uuid_str = uuid.to_string();
    let body = TTSBody {
        app: TTSApp {
            appid: appid.to_string(),
            token: token.to_string(),
            cluster: "volcano_icl".to_string(),
        },
        user: TTSUser {
            uid: uuid_str.clone(),
        },
        audio: TTSAudio {
            voice_type: speaker_id.to_string(),
            encoding: Some("mp3".to_string()),
        },
        request: TTSRequest {
            text: text.to_string(),
            reqid: uuid_str.clone(),
            text_type: None,
            operation: "query".to_string(),
        },
    };

    let client = Client::new();

    let response = client
        .post(format!("https://{}/{}", SPEECH_HOST, path))
        .headers(headers)
        .body(serde_json::to_string(&body).unwrap())
        .send()
        .await;

    let response = match response {
        Ok(response) => response,
        Err(error) => {
            return Err(error.to_string());
        }
    };

    let response_text = response.text().await;
    let response_text = match response_text {
        Ok(text) => text,
        Err(error) => return Err(error.to_string())
    };

    let response: TTSResponse = match serde_json::from_str(response_text.as_str()) {
        Ok(response) => response,
        Err(e) => {
            return Err(e.to_string());
        }
    };

    match response.data {
        Some(data) => Ok(data),
        None => Err("".to_string())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("voice_copy")
        .invoke_handler(tauri::generate_handler![
            get_all_speaker_list,
            train_speaker,
            text_to_speech,
        ])
        .build()
}
