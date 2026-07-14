import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("OpenWakeWord environment setup", () => {
  it("installs a fully pinned dependency lock without upgrading pip", async () => {
    const scriptsDirectory = join(process.cwd(), "scripts");
    const [setup, lock] = await Promise.all([
      readFile(join(scriptsDirectory, "setup-openwakeword-venv.sh"), "utf8"),
      readFile(
        join(scriptsDirectory, "openwakeword-requirements.lock"),
        "utf8",
      ),
    ]);
    const requirements = lock.trim().split("\n");

    expect(setup).toContain('--requirement "$requirements_path"');
    expect(setup).not.toMatch(/pip install --upgrade/u);
    expect(requirements).toContain("openwakeword==0.4.0");
    expect(requirements).toContain("onnxruntime==1.27.0");
    expect(requirements).toContain("scikit-learn==1.9.0");
    expect(
      requirements.every((line) => /^[a-z0-9-]+==[0-9.]+$/u.test(line)),
    ).toBe(true);
  });
});
