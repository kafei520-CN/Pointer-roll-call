use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{plugin::Builder, plugin::TauriPlugin, AppHandle, Emitter, Manager, Runtime, Url};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingXlsx {
    file_name: String,
    data: Vec<u8>,
}

fn is_spreadsheet(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "xlsx" | "xls" | "xlsm"))
        .unwrap_or(false)
}

fn looks_like_workbook(data: &[u8]) -> bool {
    data.starts_with(b"PK\x03\x04") || data.starts_with(&[0xD0, 0xCF, 0x11, 0xE0])
}

fn safe_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|ch| match ch {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            other if other.is_control() => ' ',
            other => other,
        })
        .collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim();
    if trimmed.is_empty() {
        "导出".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn workbook_name(path: &Path, data: &[u8]) -> String {
    let raw = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("import.xlsx");
    let name = safe_filename(raw);
    if is_spreadsheet(Path::new(&name)) {
        return name;
    }
    if data.starts_with(&[0xD0, 0xCF, 0x11, 0xE0]) {
        format!("{name}.xls")
    } else {
        format!("{name}.xlsx")
    }
}

fn push_unique(dirs: &mut Vec<PathBuf>, dir: PathBuf) {
    if !dirs.iter().any(|item| item == &dir) {
        dirs.push(dir);
    }
}

fn pending_dirs<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(dir) = app.path().app_cache_dir() {
        if let Some(parent) = dir.parent() {
            push_unique(&mut dirs, parent.to_path_buf());
        }
        push_unique(&mut dirs, dir);
    }
    dirs
}

fn write_pending(dir: &Path, file_name: &str, data: &[u8]) -> bool {
    if std::fs::create_dir_all(dir).is_err() {
        return false;
    }
    if std::fs::write(dir.join("pending_xlsx.bin"), data).is_err() {
        return false;
    }
    let _ = std::fs::write(dir.join("pending_xlsx.name"), file_name);
    true
}

fn write_pending_all<R: Runtime>(app: &AppHandle<R>, file_name: &str, data: &[u8]) -> bool {
    pending_dirs(app)
        .iter()
        .any(|dir| write_pending(dir, file_name, data))
}

fn clear_pending<R: Runtime>(app: &AppHandle<R>) {
    for dir in pending_dirs(app) {
        let _ = std::fs::remove_file(dir.join("pending_xlsx.bin"));
        let _ = std::fs::remove_file(dir.join("pending_xlsx.name"));
    }
}

fn seed_from_cli<R: Runtime>(app: &AppHandle<R>) {
    for arg in std::env::args().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let path = PathBuf::from(&arg);
        if !is_spreadsheet(&path) {
            continue;
        }
        let Ok(data) = std::fs::read(&path) else {
            continue;
        };
        let name = workbook_name(&path, &data);
        if write_pending_all(app, &name, &data) {
            break;
        }
    }
}

#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
pub fn paths_from_urls(urls: &[Url]) -> Vec<PathBuf> {
    urls.iter().filter_map(path_from_url).collect()
}

#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
fn path_from_url(url: &Url) -> Option<PathBuf> {
    if let Ok(path) = url.to_file_path() {
        return Some(path);
    }
    if url.scheme() != "file" || url.path().is_empty() {
        return None;
    }
    Some(PathBuf::from(url.path()))
}

/// Read spreadsheets the OS handed the app and keep one copy for the webview.
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
pub fn ingest_files<R: Runtime>(
    app: &AppHandle<R>,
    paths: impl IntoIterator<Item = PathBuf>,
) -> bool {
    for path in paths {
        if !path.is_file() {
            continue;
        }
        let Ok(data) = std::fs::read(&path) else {
            continue;
        };
        if data.is_empty() || !(is_spreadsheet(&path) || looks_like_workbook(&data)) {
            continue;
        }
        let name = workbook_name(&path, &data);
        if !write_pending_all(app, &name, &data) {
            continue;
        }
        #[cfg(target_os = "ios")]
        remove_inbox_file(&path);
        let _ = app.emit("xlsx-opened", ());
        return true;
    }
    false
}

pub fn ingest_inbox<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "ios")]
    ingest_ios_inbox(app);
    #[cfg(not(target_os = "ios"))]
    let _ = app;
}

#[cfg(target_os = "ios")]
fn ingest_ios_inbox<R: Runtime>(app: &AppHandle<R>) {
    let mut paths = Vec::new();
    for dir in ios_search_dirs(app) {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        let inbox = dir.file_name().and_then(|name| name.to_str()) == Some("Inbox");
        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if inbox || is_spreadsheet(&path) {
                paths.push(path);
            }
        }
    }
    paths.sort_by(|left, right| modified(right).cmp(&modified(left)));
    let _ = ingest_files(app, paths);
}

#[cfg(target_os = "ios")]
fn ios_search_dirs<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut homes = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        push_unique(&mut homes, PathBuf::from(home));
    }
    if let Some(home) = ns_home() {
        push_unique(&mut homes, home);
    }
    if let Ok(cache) = app.path().app_cache_dir() {
        let mut cursor = cache.as_path();
        for _ in 0..6 {
            let Some(parent) = cursor.parent() else {
                break;
            };
            push_unique(&mut homes, parent.to_path_buf());
            cursor = parent;
        }
    }
    let mut dirs = Vec::new();
    for home in homes {
        push_unique(&mut dirs, home.join("Documents").join("Inbox"));
        push_unique(&mut dirs, home.join("tmp"));
        let tmp = home.join("tmp");
        if let Ok(entries) = std::fs::read_dir(&tmp) {
            for entry in entries.filter_map(|entry| entry.ok()) {
                let path = entry.path();
                let name = path.file_name().and_then(|item| item.to_str()).unwrap_or("");
                if path.is_dir() && name.contains("Inbox") {
                    push_unique(&mut dirs, path);
                }
            }
        }
    }
    dirs
}

#[cfg(target_os = "ios")]
fn ns_home() -> Option<PathBuf> {
    #[link(name = "Foundation", kind = "framework")]
    extern "C" {
        fn NSHomeDirectory() -> *mut std::ffi::c_void;
    }
    #[link(name = "objc")]
    extern "C" {
        fn objc_msgSend(receiver: *mut std::ffi::c_void, selector: *const std::ffi::c_void) -> *const i8;
        fn sel_registerName(name: *const i8) -> *const std::ffi::c_void;
    }
    unsafe {
        let home = NSHomeDirectory();
        if home.is_null() {
            return None;
        }
        let selector = sel_registerName(c"UTF8String".as_ptr());
        let text = objc_msgSend(home, selector);
        if text.is_null() {
            return None;
        }
        Some(PathBuf::from(std::ffi::CStr::from_ptr(text).to_string_lossy().as_ref()))
    }
}

#[cfg(target_os = "ios")]
fn modified(path: &Path) -> std::time::SystemTime {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
}

#[cfg(target_os = "ios")]
fn remove_inbox_file(path: &Path) {
    let Some(parent) = path.parent() else {
        return;
    };
    let name = parent.file_name().and_then(|item| item.to_str()).unwrap_or("");
    if name == "Inbox" || name.contains("Inbox") {
        let _ = std::fs::remove_file(path);
    }
}

#[cfg(target_os = "ios")]
fn schedule_inbox_retries<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        for delay in [300, 1200, 3000, 7000] {
            std::thread::sleep(std::time::Duration::from_millis(delay));
            ingest_inbox(&app);
        }
    });
}

#[tauri::command]
fn scan_opened_xlsx<R: Runtime>(app: AppHandle<R>) -> Result<Option<PendingXlsx>, String> {
    ingest_inbox(&app);
    take_pending_xlsx(app)
}

#[tauri::command]
fn take_pending_xlsx<R: Runtime>(app: AppHandle<R>) -> Result<Option<PendingXlsx>, String> {
    for dir in pending_dirs(&app) {
        let data_path = dir.join("pending_xlsx.bin");
        if !data_path.is_file() {
            continue;
        }
        let data = std::fs::read(&data_path).map_err(|err| err.to_string())?;
        let file_name = std::fs::read_to_string(dir.join("pending_xlsx.name"))
            .ok()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| "import.xlsx".to_string());
        clear_pending(&app);
        if data.is_empty() {
            return Ok(None);
        }
        return Ok(Some(PendingXlsx { file_name, data }));
    }
    Ok(None)
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("openxlsx")
        .invoke_handler(tauri::generate_handler![take_pending_xlsx, scan_opened_xlsx])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            api.register_android_plugin("com.zhizhen.dianming", "OpenXlsxPlugin")?;
            #[cfg(not(target_os = "android"))]
            let _ = api;
            seed_from_cli(app);
            ingest_inbox(app);
            #[cfg(target_os = "ios")]
            schedule_inbox_retries(app.clone());
            Ok(())
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::{looks_like_workbook, safe_filename};

    #[test]
    fn keeps_a_chinese_workbook_name() {
        assert_eq!(safe_filename("学号查询.xlsx"), "学号查询.xlsx");
        assert_eq!(safe_filename("../a:b.xlsx"), ".. a b.xlsx");
    }

    #[test]
    fn recognizes_zip_and_ole_workbooks() {
        assert!(looks_like_workbook(b"PK\x03\x04rest"));
        assert!(looks_like_workbook(&[0xD0, 0xCF, 0x11, 0xE0, 0xA1]));
        assert!(!looks_like_workbook(b"hello"));
    }
}
