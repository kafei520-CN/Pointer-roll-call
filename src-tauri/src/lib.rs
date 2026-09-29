mod openxlsx;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(openxlsx::init())
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &event {
                let paths = openxlsx::paths_from_urls(urls);
                if !openxlsx::ingest_files(app, paths) {
                    openxlsx::ingest_inbox(app);
                }
            }
            #[cfg(target_os = "ios")]
            if let tauri::RunEvent::Resumed = &event {
                openxlsx::ingest_inbox(app);
            }
            #[cfg(not(any(target_os = "macos", target_os = "ios")))]
            let _ = (app, event);
        });
}
