use crate::error::{to_user_error, AppResult};
use reqwest::blocking::Client;
use std::time::Duration;

pub fn check_health(url: &str) -> AppResult<String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|error| to_user_error(format!("无法创建健康检查客户端：{}", error)))?;
    let response = client
        .get(url)
        .send()
        .map_err(|error| to_user_error(format!("健康检查请求失败：{}", error)))?;
    let status = response.status();
    if !status.is_success() {
        return Err(to_user_error(format!("健康检查返回状态码 {}", status)));
    }
    Ok(format!("健康检查通过：{}", status))
}
