use crate::error::{to_user_error, AppResult};
use crate::services::{app_logger, blocking};
use reqwest::blocking::Client;
use reqwest::header::USER_AGENT;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;

const NETWORK_INFO_URL: &str = "https://realip.cc";
const NETWORK_USER_AGENT: &str = "PackFlow-Workbench/3.3.1";
const NETWORK_TIMEOUT_SECS: u64 = 8;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInfo {
    pub ip: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub province: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub continent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub isp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iso_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
}

fn fetch_network_info() -> AppResult<NetworkInfo> {
    let client = Client::builder()
        .connect_timeout(Duration::from_secs(NETWORK_TIMEOUT_SECS))
        .timeout(Duration::from_secs(NETWORK_TIMEOUT_SECS))
        .build()
        .map_err(|error| to_user_error(format!("无法创建网络客户端：{}", error)))?;

    let response = client
        .get(NETWORK_INFO_URL)
        .header(USER_AGENT, NETWORK_USER_AGENT)
        .send()
        .map_err(|error| to_user_error(format!("网络请求失败：{}", error)))?;

    if !response.status().is_success() {
        return Err(to_user_error(format!(
            "网络服务返回异常状态：{}",
            response.status()
        )));
    }

    let info: NetworkInfo = response
        .json()
        .map_err(|error| to_user_error(format!("网络信息解析失败：{}", error)))?;

    if info.ip.is_empty() {
        return Err(to_user_error("网络信息中缺少 IP 地址".to_string()));
    }

    Ok(info)
}

#[tauri::command]
pub async fn get_network_info(app: AppHandle) -> AppResult<NetworkInfo> {
    app_logger::log_info(&app, "network.info.start", "查询公网 IP 信息");
    let result = blocking::run(fetch_network_info).await;
    match &result {
        Ok(info) => {
            app_logger::log_info(
                &app,
                "network.info.result",
                format!("ip={}, country={:?}, isp={:?}", info.ip, info.country, info.isp),
            );
        }
        Err(error) => {
            app_logger::log_error(&app, "network.info.error", error.clone());
        }
    }
    result
}