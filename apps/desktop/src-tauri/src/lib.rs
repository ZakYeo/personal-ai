mod desktop_shell;
mod presentation_config;
mod startup;

use presentation_config::presentation_connection_config;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    startup::configure_startup(
        context.config_mut(),
        std::env::var("PERSONAL_AI_DESKTOP_OPEN_ON_START")
            .ok()
            .as_deref(),
    );
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop_shell::show_window(app, desktop_shell::COMMAND_CENTER_WINDOW);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Personal AI")
                .build(),
        )
        .setup(desktop_shell::setup)
        .invoke_handler(tauri::generate_handler![presentation_connection_config])
        .run(context)
        .expect("failed to run Personal AI desktop application");
}
