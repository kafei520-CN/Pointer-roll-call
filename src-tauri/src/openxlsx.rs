use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{plugin::Builder, plugin::TauriPlugin, AppHandle, Manager, Runtime};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingXlsx {
    file_name: String,
    data: Vec<u8>,
}

fn is_spreadsheet(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "xlsx" | "xls" | "xlsm"
            )
        })
        .unwrap_or(false)
}

fn write_pending(dir: &Path, file_name: &str, data: &[u8]) {
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join("pending_xlsx.bin"), data);
    let _ = std::fs::write(dir.join("pending_xlsx.name"), file_name);
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
        write_pending(&dir, name, &data);
        break;
    }
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
        .invoke_handler(tauri::generate_handler![take_pending_xlsx])
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            api.register_android_plugin("com.zhizhen.dianming", "OpenXlsxPlugin")?;
            #[cfg(not(target_os = "android"))]
            let _ = api;
            seed_from_cli(app);
            Ok(())
        })
        .build()
}
