use serde::Serialize;

const DEFAULT_PRESENTATION_PORT: u16 = 43_118;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationConnectionConfig {
    endpoint: String,
    token: String,
}

#[tauri::command]
pub fn presentation_connection_config() -> Result<PresentationConnectionConfig, String> {
    let port = read_presentation_port()?;
    let token = std::env::var("PERSONAL_AI_PRESENTATION_TOKEN")
        .map_err(|_| "Desktop presentation authentication is not configured.".to_owned())?;
    if !(32..=512).contains(&token.len()) || token.chars().any(char::is_control) {
        return Err("Desktop presentation authentication is invalid.".to_owned());
    }
    Ok(PresentationConnectionConfig {
        endpoint: format!("ws://127.0.0.1:{port}"),
        token,
    })
}

fn read_presentation_port() -> Result<u16, String> {
    parse_presentation_port(std::env::var("PERSONAL_AI_PRESENTATION_PORT"))
}

fn parse_presentation_port(value: Result<String, std::env::VarError>) -> Result<u16, String> {
    match value {
        Ok(value) => value
            .parse::<u16>()
            .map_err(|_| "Desktop presentation port is invalid.".to_owned()),
        Err(std::env::VarError::NotPresent) => Ok(DEFAULT_PRESENTATION_PORT),
        Err(std::env::VarError::NotUnicode(_)) => {
            Err("Desktop presentation port is invalid.".to_owned())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_presentation_port, DEFAULT_PRESENTATION_PORT};

    #[test]
    fn default_port_is_valid() {
        let port = parse_presentation_port(Err(std::env::VarError::NotPresent))
            .expect("default port should be valid");
        assert_eq!(port, DEFAULT_PRESENTATION_PORT);
    }

    #[test]
    fn invalid_port_is_rejected() {
        let result = parse_presentation_port(Ok("not-a-port".to_owned()));
        assert_eq!(
            result,
            Err("Desktop presentation port is invalid.".to_owned())
        );
    }
}
