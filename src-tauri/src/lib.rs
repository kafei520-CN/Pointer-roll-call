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
            #[cfg(any(target_os = "ios", target_os = "android"))]
            if let tauri::RunEvent::Opened { .. } = &event {
                openxlsx::nudge_pending(app.clone());
            }
            #[cfg(any(target_os = "ios", target_os = "android"))]
            if matches!(
                &event,
                tauri::RunEvent::Resumed
                    | tauri::RunEvent::WindowEvent {
                        event: tauri::WindowEvent::Resumed,
                        ..
                    }
            ) {
                openxlsx::ingest_inbox(app);
                openxlsx::nudge_pending(app.clone());
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
            let _ = (app, event);
        });
}
