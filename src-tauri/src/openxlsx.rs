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

#[cfg(target_os = "ios")]
fn ios_cache_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let home = ns_home().or_else(|| std::env::var_os("HOME").map(PathBuf::from));
    if let Some(home) = home {
        let caches = home.join("Library").join("Caches");
        push_unique(&mut dirs, caches.clone());
        push_unique(&mut dirs, caches.join("com.zhizhen.dianming"));
    }
    dirs
}

fn pending_dirs<R: Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(dir) = app.path().app_cache_dir() {
        if let Some(parent) = dir.parent() {
            push_unique(&mut dirs, parent.to_path_buf());
        }
        push_unique(&mut dirs, dir);
    }
    #[cfg(target_os = "ios")]
    for dir in ios_cache_dirs() {
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

fn read_workbook(path: &Path) -> Option<Vec<u8>> {
    if let Ok(data) = std::fs::read(path) {
        if !data.is_empty() {
            return Some(data);
        }
    }
    #[cfg(target_os = "ios")]
    {
        return read_scoped_path(path);
    }
    #[cfg(not(target_os = "ios"))]
    None
}

/// Read spreadsheets the OS handed the app and keep one copy for the webview.
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
pub fn ingest_files<R: Runtime>(
    app: &AppHandle<R>,
    paths: impl IntoIterator<Item = PathBuf>,
) -> bool {
    for path in paths {
        if path.is_dir() {
            continue;
        }
        let Some(data) = read_workbook(&path) else {
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
        if std::fs::remove_file(path).is_err() && path.exists() {
            // A later scan accepts every Inbox file. Leave nothing readable behind.
            let _ = std::fs::write(path, b"");
        }
    }
}

#[cfg(target_os = "ios")]
fn read_scoped_path(path: &Path) -> Option<Vec<u8>> {
    let text = path.to_str()?;
    unsafe { read_scoped_text(text) }
}

#[cfg(target_os = "ios")]
fn stash_bytes(name: &str, data: &[u8]) -> bool {
    if data.is_empty() || !(is_spreadsheet(Path::new(name)) || looks_like_workbook(data)) {
        return false;
    }
    let stored = workbook_name(Path::new(name), data);
    ios_cache_dirs()
        .iter()
        .any(|dir| write_pending(dir, &stored, data))
}

#[cfg(target_os = "ios")]
mod scene_hook {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::{remove_inbox_file, stash_bytes};

    static WILL_CONNECT_IMP: AtomicUsize = AtomicUsize::new(0);

    /// Tao drops `UISceneConnectionOptions.URLContexts` inside
    /// `scene:willConnectToSession:options:`. A cold start delivers the file
    /// only there, so copy the bytes before the original implementation runs.
    pub fn install() {
        unsafe {
            if WILL_CONNECT_IMP.load(Ordering::Relaxed) != 0 {
                return;
            }
            let class = objc_getClass(c"TaoSceneDelegate".as_ptr());
            if class.is_null() {
                return;
            }
            let selector = sel_registerName(c"scene:willConnectToSession:options:".as_ptr());
            let method = class_getInstanceMethod(class, selector);
            if method.is_null() {
                return;
            }
            let previous = method_setImplementation(
                method,
                std::mem::transmute::<*const (), *const std::ffi::c_void>(will_connect as *const ()),
            );
            if !previous.is_null() {
                WILL_CONNECT_IMP.store(previous as usize, Ordering::Relaxed);
            }
        }
    }

    unsafe extern "C" fn will_connect(
        this: *mut std::ffi::c_void,
        cmd: *const std::ffi::c_void,
        scene: *mut std::ffi::c_void,
        session: *mut std::ffi::c_void,
        options: *mut std::ffi::c_void,
    ) {
        capture_connection_urls(options);
        let previous = WILL_CONNECT_IMP.load(Ordering::Relaxed);
        if previous != 0 {
            let original: unsafe extern "C" fn(
                *mut std::ffi::c_void,
                *const std::ffi::c_void,
                *mut std::ffi::c_void,
                *mut std::ffi::c_void,
                *mut std::ffi::c_void,
            ) = std::mem::transmute(previous);
            original(this, cmd, scene, session, options);
        }
    }

    unsafe fn capture_connection_urls(options: *mut std::ffi::c_void) {
        if options.is_null() {
            return;
        }
        let contexts = msg0(options, c"URLContexts");
        if contexts.is_null() {
            return;
        }
        let count = msg_usize(contexts, c"count");
        if count == 0 {
            return;
        }
        let items = msg0(contexts, c"allObjects");
        if items.is_null() {
            return;
        }
        let limit = count.min(8);
        for index in 0..limit {
            let ctx = msg_index(items, c"objectAtIndex:", index);
            if ctx.is_null() {
                continue;
            }
            let url = msg0(ctx, c"URL");
            if url.is_null() {
                continue;
            }
            if stash_nsurl(url) {
                break;
            }
        }
    }

    unsafe fn stash_nsurl(url: *mut std::ffi::c_void) -> bool {
        let accessed = msg_u8(url, c"startAccessingSecurityScopedResource") != 0;
        let name = ns_to_string(msg0(url, c"lastPathComponent")).unwrap_or_else(|| "import.xlsx".to_string());
        let path_text = ns_to_string(msg0(url, c"path"));
        let mut bytes = path_text.as_deref().and_then(|path| std::fs::read(path).ok().filter(|item| !item.is_empty()));
        if bytes.is_none() {
            let nsdata = msg1(objc_getClass(c"NSData".as_ptr()), c"dataWithContentsOfURL:", url);
            bytes = nsdata_bytes(nsdata);
        }
        if accessed {
            let _ = msg0(url, c"stopAccessingSecurityScopedResource");
        }
        let Some(data) = bytes else {
            return false;
        };
        if !stash_bytes(&name, &data) {
            return false;
        }
        if let Some(path) = path_text {
            remove_inbox_file(std::path::Path::new(&path));
        }
        true
    }

    unsafe fn ns_to_string(value: *mut std::ffi::c_void) -> Option<String> {
        if value.is_null() {
            return None;
        }
        let text = msg0(value, c"UTF8String") as *const i8;
        if text.is_null() {
            return None;
        }
        Some(std::ffi::CStr::from_ptr(text).to_string_lossy().into_owned())
    }

    unsafe fn nsdata_bytes(data: *mut std::ffi::c_void) -> Option<Vec<u8>> {
        if data.is_null() {
            return None;
        }
        let length = msg_usize(data, c"length");
        if length == 0 {
            return None;
        }
        let bytes = msg0(data, c"bytes") as *const u8;
        if bytes.is_null() {
            return None;
        }
        Some(std::slice::from_raw_parts(bytes, length).to_vec())
    }

    unsafe fn msg0(receiver: *mut std::ffi::c_void, name: &std::ffi::CStr) -> *mut std::ffi::c_void {
        if receiver.is_null() {
            return std::ptr::null_mut();
        }
        let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) -> *mut std::ffi::c_void =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, sel_registerName(name.as_ptr()))
    }

    unsafe fn msg1(
        receiver: *mut std::ffi::c_void,
        name: &std::ffi::CStr,
        arg: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void {
        if receiver.is_null() {
            return std::ptr::null_mut();
        }
        let send: unsafe extern "C" fn(
            *mut std::ffi::c_void,
            *const std::ffi::c_void,
            *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void = std::mem::transmute(objc_msgSend as *const ());
        send(receiver, sel_registerName(name.as_ptr()), arg)
    }

    unsafe fn msg_index(receiver: *mut std::ffi::c_void, name: &std::ffi::CStr, index: usize) -> *mut std::ffi::c_void {
        if receiver.is_null() {
            return std::ptr::null_mut();
        }
        let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void, usize) -> *mut std::ffi::c_void =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, sel_registerName(name.as_ptr()), index)
    }

    unsafe fn msg_usize(receiver: *mut std::ffi::c_void, name: &std::ffi::CStr) -> usize {
        if receiver.is_null() {
            return 0;
        }
        let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) -> usize =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, sel_registerName(name.as_ptr()))
    }

    unsafe fn msg_u8(receiver: *mut std::ffi::c_void, name: &std::ffi::CStr) -> u8 {
        if receiver.is_null() {
            return 0;
        }
        let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) -> u8 =
            std::mem::transmute(objc_msgSend as *const ());
        send(receiver, sel_registerName(name.as_ptr()))
    }

    #[link(name = "objc")]
    extern "C" {
        fn objc_getClass(name: *const i8) -> *mut std::ffi::c_void;
        fn sel_registerName(name: *const i8) -> *const std::ffi::c_void;
        fn class_getInstanceMethod(
            class: *mut std::ffi::c_void,
            selector: *const std::ffi::c_void,
        ) -> *mut std::ffi::c_void;
        fn method_setImplementation(
            method: *mut std::ffi::c_void,
            implementation: *const std::ffi::c_void,
        ) -> *const std::ffi::c_void;
        fn objc_msgSend();
    }
}

#[cfg(target_os = "ios")]
unsafe fn read_scoped_text(text: &str) -> Option<Vec<u8>> {
    let c_text = std::ffi::CString::new(text).ok()?;
    let ns_string = {
        let send: unsafe extern "C" fn(
            *mut std::ffi::c_void,
            *const std::ffi::c_void,
            *const i8,
        ) -> *mut std::ffi::c_void = std::mem::transmute(objc_msg_send as *const ());
        send(
            objc_get_class(c"NSString".as_ptr()),
            sel_get(c"stringWithUTF8String:".as_ptr()),
            c_text.as_ptr(),
        )
    };
    if ns_string.is_null() {
        return None;
    }
    let url = {
        let send: unsafe extern "C" fn(
            *mut std::ffi::c_void,
            *const std::ffi::c_void,
            *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void = std::mem::transmute(objc_msg_send as *const ());
        send(
            objc_get_class(c"NSURL".as_ptr()),
            sel_get(c"fileURLWithPath:".as_ptr()),
            ns_string,
        )
    };
    if url.is_null() {
        return None;
    }
    scene_hook_read_url(url)
}

#[cfg(target_os = "ios")]
fn scene_hook_read_url(url: *mut std::ffi::c_void) -> Option<Vec<u8>> {
    // Reuse the same security-scoped read as the scene hook by going through NSData.
    unsafe {
        let accessed = {
            let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) -> u8 =
                std::mem::transmute(objc_msg_send as *const ());
            send(url, sel_get(c"startAccessingSecurityScopedResource".as_ptr())) != 0
        };
        let data = {
            let send: unsafe extern "C" fn(
                *mut std::ffi::c_void,
                *const std::ffi::c_void,
                *mut std::ffi::c_void,
            ) -> *mut std::ffi::c_void = std::mem::transmute(objc_msg_send as *const ());
            send(
                objc_get_class(c"NSData".as_ptr()),
                sel_get(c"dataWithContentsOfURL:".as_ptr()),
                url,
            )
        };
        let bytes = nsdata_to_vec(data);
        if accessed {
            let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) =
                std::mem::transmute(objc_msg_send as *const ());
            send(url, sel_get(c"stopAccessingSecurityScopedResource".as_ptr()));
        }
        bytes
    }
}

#[cfg(target_os = "ios")]
unsafe fn nsdata_to_vec(data: *mut std::ffi::c_void) -> Option<Vec<u8>> {
    if data.is_null() {
        return None;
    }
    let length = {
        let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) -> usize =
            std::mem::transmute(objc_msg_send as *const ());
        send(data, sel_get(c"length".as_ptr()))
    };
    if length == 0 {
        return None;
    }
    let bytes = {
        let send: unsafe extern "C" fn(*mut std::ffi::c_void, *const std::ffi::c_void) -> *const u8 =
            std::mem::transmute(objc_msg_send as *const ());
        send(data, sel_get(c"bytes".as_ptr()))
    };
    if bytes.is_null() {
        return None;
    }
    Some(std::slice::from_raw_parts(bytes, length).to_vec())
}

#[cfg(target_os = "ios")]
unsafe fn objc_get_class(name: *const i8) -> *mut std::ffi::c_void {
    objc_get_class_raw(name)
}

#[cfg(target_os = "ios")]
unsafe fn sel_get(name: *const i8) -> *const std::ffi::c_void {
    sel_register_raw(name)
}

#[cfg(target_os = "ios")]
#[link(name = "objc")]
extern "C" {
    #[link_name = "objc_msgSend"]
    fn objc_msg_send();
    #[link_name = "objc_getClass"]
    fn objc_get_class_raw(name: *const i8) -> *mut std::ffi::c_void;
    #[link_name = "sel_registerName"]
    fn sel_register_raw(name: *const i8) -> *const std::ffi::c_void;
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
            #[cfg(target_os = "ios")]
            scene_hook::install();
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
