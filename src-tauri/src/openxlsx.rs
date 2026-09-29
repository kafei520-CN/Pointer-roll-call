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

fn seed_from_cli<R: Runtime>(app: &AppHandle<R>) {
    let Ok(dir) = app.path().app_cache_dir() else {
        return;
    };
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
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("import.xlsx");
        let _ = write_pending(&dir, name, &data);
        break;
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
    let Ok(dir) = app.path().app_cache_dir() else {
        return false;
    };
    for path in paths {
        if !path.is_file() || !is_spreadsheet(&path) {
            continue;
        }
        let Ok(data) = std::fs::read(&path) else {
            continue;
        };
        if data.is_empty() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("import.xlsx");
        if !write_pending(&dir, name, &data) {
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
    let Some(dir) = ios_inbox_dir() else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .collect();
    paths.sort_by(|left, right| modified(right).cmp(&modified(left)));
    let _ = ingest_files(app, paths);
}

#[cfg(target_os = "ios")]
fn ios_inbox_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    let dir = PathBuf::from(home).join("Documents").join("Inbox");
    dir.is_dir().then_some(dir)
}

#[cfg(target_os = "ios")]
fn modified(path: &Path) -> std::time::SystemTime {
    std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
}

#[cfg(target_os = "ios")]
fn remove_inbox_file(path: &Path) {
    let Some(inbox) = path.parent() else {
        return;
    };
    if inbox.file_name().and_then(|name| name.to_str()) != Some("Inbox") {
        return;
    }
    let Some(documents) = inbox.parent() else {
        return;
    };
    if documents.file_name().and_then(|name| name.to_str()) != Some("Documents") {
        return;
    }
    let _ = std::fs::remove_file(path);
}

#[tauri::command]
fn scan_opened_xlsx<R: Runtime>(app: AppHandle<R>) -> Result<Option<PendingXlsx>, String> {
    ingest_inbox(&app);
    take_pending_xlsx(app)
}

#[tauri::command]
fn take_pending_xlsx<R: Runtime>(app: AppHandle<R>) -> Result<Option<PendingXlsx>, String> {
    let dir = app.path().app_cache_dir().map_err(|err| err.to_string())?;
    let data_path = dir.join("pending_xlsx.bin");
    if !data_path.is_file() {
        return Ok(None);
    }
    let data = std::fs::read(&data_path).map_err(|err| err.to_string())?;
    let file_name = std::fs::read_to_string(dir.join("pending_xlsx.name"))
        .ok()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| "import.xlsx".to_string());
    let _ = std::fs::remove_file(&data_path);
    let _ = std::fs::remove_file(dir.join("pending_xlsx.name"));
    Ok(Some(PendingXlsx { file_name, data }))
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
            Ok(())
        })
        .build()
}
