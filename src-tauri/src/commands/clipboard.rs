use crate::error::{to_user_error, AppResult};
use crate::services::app_logger;
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;
use tauri::AppHandle;
use windows_sys::Win32::Foundation::{GlobalFree, HWND};
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

// CF_UNICODETEXT 的常量值（Windows SDK 中定义为 13）。
// windows_sys 0.59 未直接导出该常量，这里显式声明。
const CF_UNICODETEXT: u32 = 13;
// CF_HDROP 的常量值（Windows SDK 中定义为 15）。
const CF_HDROP: u32 = 15;

// 与 Windows SDK 的 DROPFILES 布局严格一致（20 字节）。
// pFiles 为从结构体起始到文件名列表的字节偏移；fWide=1 表示路径使用 UTF-16。
#[repr(C)]
struct DropFiles {
    p_files: u32,
    pt_x: i32,
    pt_y: i32,
    f_nc: i32,
    f_wide: i32,
}

const _: () = assert!(std::mem::size_of::<DropFiles>() == 20);

/// 分配一块 GMEM_MOVEABLE 内存并写入字节内容，返回句柄。
/// 失败时返回 None（调用方负责关闭剪贴板）。
unsafe fn alloc_and_fill(data: &[u8]) -> Option<usize> {
    let h_mem = GlobalAlloc(GMEM_MOVEABLE, data.len());
    if h_mem.is_null() {
        return None;
    }
    let ptr = GlobalLock(h_mem) as *mut u8;
    if ptr.is_null() {
        GlobalFree(h_mem);
        return None;
    }
    std::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len());
    GlobalUnlock(h_mem);
    Some(h_mem as usize)
}

/// 将句柄写入指定剪贴板格式。成功后句柄所有权转移给系统，不可再释放。
/// 失败时自行释放并返回 false。
unsafe fn set_format(h_mem: usize, format: u32) -> bool {
    let result = SetClipboardData(format, h_mem as *mut _);
    if result.is_null() {
        GlobalFree(h_mem as *mut _);
        false
    } else {
        true
    }
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

    // CF_HDROP：路径使用 UTF-16 编码，每个路径以 \0 结束，列表末尾再追加一个 \0。
    let mut wide_path: Vec<u16> = target.as_os_str().encode_wide().collect();
    wide_path.push(0);
    wide_path.push(0);

    let drop_size = std::mem::size_of::<DropFiles>();
    let header = DropFiles {
        p_files: drop_size as u32,
        pt_x: 0,
        pt_y: 0,
        f_nc: 0,
        f_wide: 1,
    };
    // 将 DROPFILES 头部 + UTF-16 路径拼接到一个字节缓冲区。
    // SAFETY: header 是 #[repr(C)] 结构体，按值构造；wide_path 在此期间存活且未修改。
    // 两个 from_raw_parts 都只读取有效内存区域，随后立即拷贝进 Vec<u8>。
    let (header_bytes, path_bytes) = unsafe {
        let hb = std::slice::from_raw_parts(&header as *const DropFiles as *const u8, drop_size);
        let pb = std::slice::from_raw_parts(
            wide_path.as_ptr() as *const u8,
            wide_path.len() * 2,
        );
        (hb, pb)
    };
    let mut hdrop_bytes: Vec<u8> = Vec::with_capacity(header_bytes.len() + path_bytes.len());
    hdrop_bytes.extend_from_slice(header_bytes);
    hdrop_bytes.extend_from_slice(path_bytes);

    // CF_UNICODETEXT：完整路径文本（UTF-16，单 \0 结尾）。
    // 同时写入文本格式，便于 SSH 客户端、文本编辑器等仅识别文本格式的程序粘贴，
    // 避免中文文件名被当作 ANSI 文本解析而出现乱码。
    let mut wide_text: Vec<u16> = target.as_os_str().encode_wide().collect();
    wide_text.push(0);
    // SAFETY: wide_text 在此期间存活且未修改，读取其字节视图有效。
    let text_bytes: &[u8] = unsafe {
        std::slice::from_raw_parts(wide_text.as_ptr() as *const u8, wide_text.len() * 2)
    };

    unsafe {
        let owner: HWND = std::ptr::null_mut();
        if OpenClipboard(owner) == 0 {
            return Err(to_user_error("无法打开剪贴板"));
        }

        EmptyClipboard();

        // 写入 CF_HDROP（文件引用，供资源管理器等使用）。
        let mut ok = true;
        if let Some(h_mem) = alloc_and_fill(&hdrop_bytes) {
            if !set_format(h_mem, CF_HDROP) {
                ok = false;
            }
        } else {
            ok = false;
        }

        // 写入 CF_UNICODETEXT（路径文本，供 SSH 客户端、编辑器等使用）。
        if ok {
            if let Some(h_mem) = alloc_and_fill(text_bytes) {
                if !set_format(h_mem, CF_UNICODETEXT) {
                    ok = false;
                }
            } else {
                ok = false;
            }
        }

        CloseClipboard();

        if !ok {
            return Err(to_user_error("无法设置剪贴板数据"));
        }
    }

    app_logger::log_info(
        &app,
        "filesystem.clipboard.copy.success",
        format!("path={}", path),
    );
    Ok(())
}
