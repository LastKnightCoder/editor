use aliyun_oss_rs::OssClient;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct BucketInfo {
    bucket: String,
    region: String,
}

#[tauri::command]
pub async fn get_ali_oss_buckets(key_id: String, key_secret: String) -> Result<Vec<BucketInfo>, String> {
    let client = OssClient::new(&key_id, &key_secret);
    let buckets = client.list_buckets().send().await;
    let buckets = match buckets {
        Ok(buckets) => buckets,
        Err(e) => {
            println!("get Error {}", e.to_string());
            return Err(e.to_string());
        }
    };

    match buckets.buckets {
        Some(buckets) => {
            let buckets: Vec<BucketInfo> = buckets
                .into_iter()
                .map(move |bucket| BucketInfo {
                    bucket: bucket.name,
                    region: bucket.region,
                }).collect();
            Ok(buckets)
        },
        _ => {
            Err("none".to_string())
        }
    }
}