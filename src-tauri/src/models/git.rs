use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub name: String,
    pub is_current: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepositoryStatus {
    pub is_git_repo: bool,
    pub branch: Option<String>,
    pub branches: Vec<GitBranch>,
    pub upstream: Option<String>,
    pub ahead_count: u32,
    pub behind_count: u32,
    pub has_remote_updates: bool,
    pub has_local_changes: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub author: String,
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullResult {
    pub success: bool,
    pub output: String,
    pub status: GitRepositoryStatus,
    /// 拉取已成功、但后续步骤（如恢复自动贮藏的本地改动）需要用户处理时的提示。
    /// 与 output 分开是为了让前端能用“警告”而不是“失败”的语气呈现。
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSwitchBranchResult {
    pub success: bool,
    pub output: String,
    pub status: GitRepositoryStatus,
}
