use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, Runtime, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const COMMAND_CENTER_WINDOW: &str = "main";
const OVERLAY_WINDOW: &str = "overlay";
const OPEN_MENU_ID: &str = "open-command-center";
const QUIT_MENU_ID: &str = "quit";
const WAKE_SHORTCUT: &str = "CommandOrControl+Shift+Space";

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    configure_tray(app)?;
    configure_shortcut(app)?;
    keep_command_center_available(app);
    Ok(())
}

pub fn show_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn configure_tray(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN_MENU_ID, "Open command center", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_MENU_ID, "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Personal AI")
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_MENU_ID => show_window(app, COMMAND_CENTER_WINDOW),
            QUIT_MENU_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if is_primary_release(&event) {
                show_window(tray.app_handle(), COMMAND_CENTER_WINDOW);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn configure_shortcut(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    app.global_shortcut()
        .on_shortcut(WAKE_SHORTCUT, |app, _, event| {
            if event.state() == ShortcutState::Pressed {
                show_window(app, OVERLAY_WINDOW);
            }
        })?;
    Ok(())
}

fn keep_command_center_available(app: &App) {
    if let Some(window) = app.get_webview_window(COMMAND_CENTER_WINDOW) {
        let closable_window = window.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = closable_window.hide();
            }
        });
    }
}

fn is_primary_release(event: &TrayIconEvent) -> bool {
    matches!(
        event,
        TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
        }
    )
}
