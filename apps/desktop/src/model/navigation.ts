export const desktopSections = Object.freeze([
  "Today",
  "Tasks",
  "Alarms",
  "Interactions",
  "Sources",
  "Profile",
  "Integrations",
  "Activity",
  "Settings",
] as const);

export type DesktopSection = (typeof desktopSections)[number];
export type DesktopMode = "command-center" | "overlay";
