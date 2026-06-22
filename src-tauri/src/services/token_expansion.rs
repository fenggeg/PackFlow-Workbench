use std::collections::HashMap;

/// 使用变量映射展开模板字符串
/// 支持 {{variableName}} 语法
pub fn expand_template(template: &str, variables: &HashMap<String, String>) -> String {
    let mut result = template.to_string();
    
    // 展开 {{variableName}} 语法
    for (key, value) in variables {
        let pattern = format!("{{{{{}}}}}", key);
        result = result.replace(&pattern, value);
    }
    
    result
}