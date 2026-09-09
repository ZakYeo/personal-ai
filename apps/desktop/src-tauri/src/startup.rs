pub fn configure_startup(config: &mut tauri::Config, open_on_start: Option<&str>) {
    if open_on_start == Some("1") {
        if let Some(window) = config.app.windows.iter_mut().find(|w| w.label == "main") {
            window.visible = true;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_launch_opens_only_the_command_center() {
        let mut context: tauri::Context<tauri::Wry> = tauri::generate_context!();
        configure_startup(context.config_mut(), Some("1"));
        let windows = &context.config().app.windows;
        assert!(windows.iter().find(|w| w.label == "main").unwrap().visible);
        assert!(
            !windows
                .iter()
                .find(|w| w.label == "overlay")
                .unwrap()
                .visible
        );
    }

    #[test]
    fn background_launch_keeps_windows_hidden() {
        for value in [None, Some("0"), Some("true")] {
            let mut context: tauri::Context<tauri::Wry> = tauri::generate_context!();
            configure_startup(context.config_mut(), value);
            assert!(context.config().app.windows.iter().all(|w| !w.visible));
        }
    }
}
