export function desktopGraphicsEnvironment(platform, source) {
  const env = { ...source };
  if (platform === "linux" && (env.WSL_DISTRO_NAME || env.WSL_INTEROP)) {
    // Use WSLg's X11 window path; Wayland activation can leave the UI inaccessible.
    env.GDK_BACKEND ??= "x11";
    // WSL GPU discovery can fail before WebKit creates its first visible window.
    env.LIBGL_ALWAYS_SOFTWARE ??= "1";
    env.WEBKIT_DISABLE_DMABUF_RENDERER ??= "1";
    env.WEBKIT_DISABLE_COMPOSITING_MODE ??= "1";
  }
  return env;
}
