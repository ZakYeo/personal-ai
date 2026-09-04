export function SettingsPanel(properties: {
  readonly autostartEnabled: boolean;
  readonly onApplyShortcut: () => void;
  readonly onAutostartChange: (enabled: boolean) => void;
  readonly onShortcutChange: (value: string) => void;
  readonly shortcutDraft: string;
}) {
  return (
    <section className="settings-panel" aria-label="Desktop settings">
      <label className="setting-row">
        <span>
          <strong>Start with this computer</strong>
          <small>Off until you explicitly enable it.</small>
        </span>
        <input
          checked={properties.autostartEnabled}
          onChange={(event) =>
            properties.onAutostartChange(event.target.checked)
          }
          type="checkbox"
        />
      </label>
      <div className="setting-column">
        <label htmlFor="desktop-shortcut">Overlay shortcut</label>
        <div>
          <input
            id="desktop-shortcut"
            maxLength={100}
            onChange={(event) =>
              properties.onShortcutChange(event.target.value)
            }
            value={properties.shortcutDraft}
          />
          <button onClick={properties.onApplyShortcut}>Apply</button>
        </div>
      </div>
      <p className="privacy-note">
        Microphone state is always visible. The desktop receives safe
        presentation data, never credentials or internal diagnostics.
      </p>
    </section>
  );
}
