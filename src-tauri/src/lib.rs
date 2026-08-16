#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Hands mailto:/sms: URIs to the OS (ACTION_VIEW on Android) so the
        // coordinator's own mail app sends; the WebView cannot load them
        // (ERR_UNKNOWN_URL_SCHEME). See docs/adr/0002.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
