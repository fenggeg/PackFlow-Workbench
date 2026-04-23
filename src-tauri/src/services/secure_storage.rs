use crate::error::{to_user_error, AppResult};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::{HLOCAL, LocalFree};
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};

pub fn encrypt_string(value: &str) -> AppResult<String> {
    if value.is_empty() {
        return Ok(String::new());
    }

    let input = CRYPT_INTEGER_BLOB {
        cbData: value.len() as u32,
        pbData: value.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let success = unsafe {
        CryptProtectData(
            &input,
            null(),
            null(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 {
        return Err(to_user_error("无法加密敏感信息。"));
    }

    let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let encoded = STANDARD.encode(bytes);
    unsafe {
        LocalFree(output.pbData as HLOCAL);
    }
    Ok(encoded)
}

pub fn decrypt_string(value: &str) -> AppResult<String> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }

    let decoded = STANDARD
        .decode(value)
        .map_err(|error| to_user_error(format!("无法解密敏感信息：{}", error)))?;
    let mut input = CRYPT_INTEGER_BLOB {
        cbData: decoded.len() as u32,
        pbData: decoded.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };

    let success = unsafe {
        CryptUnprotectData(
            &mut input,
            null_mut(),
            null(),
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if success == 0 {
        return Err(to_user_error("无法解密敏感信息。"));
    }

    let bytes = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) };
    let result = String::from_utf8(bytes.to_vec())
        .map_err(|error| to_user_error(format!("敏感信息解码失败：{}", error)))?;
    unsafe {
        LocalFree(output.pbData as HLOCAL);
    }
    Ok(result)
}
