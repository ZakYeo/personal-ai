import { checkDesktopDependencies } from "./desktop-dependencies.mjs";

try {
  checkDesktopDependencies();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
