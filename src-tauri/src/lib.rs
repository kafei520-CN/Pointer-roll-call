mod openxlsx;

use openxlsx::{opened_urls, scan_opened_xlsx, take_pending_xlsx};
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(openxlsx::init())
        .invoke_handler(tauri::generate_handler![
            opened_urls,
            scan_opened_xlsx,
            take_pending_xlsx
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { urls } = &event {
                openxlsx::remember_urls(urls);
                if !openxlsx::ingest_urls(app, urls) {
                    openxlsx::ingest_inbox(app);
                }
                let _ = app.emit(
                    "opened",
                    urls.iter().map(|url| url.to_string()).collect::<Vec<_>>(),
                );
            }
            #[cfg(target_os = "ios")]
            if let tauri::RunEvent::Resumed = &event {
                openxlsx::ingest_inbox(app);
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
            let _ = (app, event);
        });
}
