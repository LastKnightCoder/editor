use std::io::{self, Read};
#[tokio::main]
async fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let payload = serde_json::from_str(&input).unwrap_or(serde_json::Value::Null);
    match mobile_lib::device_sync_spike::run(&args[1], &args[2], payload).await {
        Ok(value) => println!("{}", value),
        Err(error) => {
            eprintln!("{}", error);
            std::process::exit(1);
        }
    }
}
