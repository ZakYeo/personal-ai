mod desktop_shell;
mod presentation_config;

use presentation_config::presentation_connection_config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop_shell::show_window(app, desktop_shell::COMMAND_CENTER_WINDOW);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Personal AI")
                .build(),
        )
        .setup(desktop_shell::setup)
        .invoke_handler(tauri::generate_handler![presentation_connection_config])
        .run(tauri::generate_context!())
        .expect("failed to run Personal AI desktop application");
}
