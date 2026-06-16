use crate::error::{to_user_error, AppResult};
use crate::services::app_logger;
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use tauri::AppHandle;
use windows_sys::Win32::Foundation::{GetLastError, GlobalFree, HWND};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
use windows_sys::Win32::System::Ole::CF_HDROP;
use windows_sys::Win32::System::WindowsProgramming::GMEM_SHARE;

#[repr(C)]
struct DropFiles {
    p_files: u32,
    pt_x: i32,
    pt_y: i32,
    f_nc: i32,
    wide: i32,
}

#[tauri::command]
pub fn copy_file_to_clipboard(app: AppHandle, path: String) -> AppResult<()> {
    app_logger::log_info(
        &app,
        "filesystem.clipboard.copy.start",
        format!("path={}", path),
    );
    let target = PathBuf::from(&path);
    if !target.exists() || !target.is_file() {
        return Err(to_user_error(format!("文件不存在：{}", path)));
    }

    unsafe {
        let owner: HWND = std::ptr::null_mut();
        if OpenClipboard(owner) == 0 {
            return Err(to_user_error("无法打开剪贴板"));
        }

        EmptyClipboard();

        let wide_path: Vec<u16> = target
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let drop_size = std::mem::size_of::<DropFiles>();
        let path_size = wide_path.len() * 2;
        let total = drop_size + path_size;

        let h_mem = GlobalAlloc(GMEM_MOVEABLE | GMEM_SHARE, total);
        if h_mem.is_null() {
            CloseClipboard();
            return Err(to_user_error("无法分配剪贴板内存"));
        }

        let ptr = GlobalLock(h_mem) as *mut u8;
        if ptr.is_null() {
            GlobalFree(h_mem);
            CloseClipboard();
            return Err(to_user_error("无法锁定剪贴板内存"));
        }

        let drop = ptr as *mut DropFiles;
        (*drop).p_files = drop_size as u32;
        (*drop).pt_x = 0;
        (*drop).pt_y = 0;
        (*drop).f_nc = 0;
        (*drop).wide = 1;

        let path_dst = ptr.add(drop_size) as *mut u16;
        std::ptr::copy_nonoverlapping(wide_path.as_ptr(), path_dst, wide_path.len());

        GlobalUnlock(h_mem);

        let result = SetClipboardData(CF_HDROP as u32, h_mem);
        if result.is_null() && GetLastError() != 0 {
            GlobalFree(h_mem);
            CloseClipboard();
            return Err(to_user_error("无法设置剪贴板数据"));
        }

        CloseClipboard();
    }

    app_logger::log_info(
        &app,
        "filesystem.clipboard.copy.success",
        format!("path={}", path),
    );
    Ok(())
}
