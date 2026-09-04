import type { DesktopConnectionState } from "../model/desktop-state.js";

export function ConnectionBadge(properties: {
  readonly label: string;
  readonly state: DesktopConnectionState;
}) {
  return (
    <span className={`connection connection-${properties.state}`}>
      {properties.label}
    </span>
  );
}
