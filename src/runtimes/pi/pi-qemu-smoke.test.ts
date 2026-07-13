import { runPiQemuSmoke } from "./pi-qemu-smoke.js";

describe("runPiQemuSmoke", () => {
  it("prints a stable QEMU smoke command without spawning by default", async () => {
    const stdout = createWriter();
    const spawn = vi.fn();

    await expect(
      runPiQemuSmoke(
        [
          "--config",
          "pi-config.json",
          "--image",
          "pi-os.img",
          "--kernel",
          "kernel8.img",
          "--dtb",
          "bcm2710-rpi-3-b-plus.dtb",
        ],
        {
          commandExists: () => true,
          fileExists: () => true,
          spawn,
          stderr: createWriter(),
          stdout,
        },
      ),
    ).resolves.toBe(0);

    expect(spawn).not.toHaveBeenCalled();
    expect(stdout.writes).toEqual([
      "qemu-system-aarch64 -machine raspi3b -m 1024 -smp 4 -kernel kernel8.img -dtb bcm2710-rpi-3-b-plus.dtb -drive file=pi-os.img,format=raw,if=sd -append 'rw root=/dev/mmcblk0p2 rootwait console=ttyAMA0,115200' -serial stdio -netdev user,id=net0,hostfwd=tcp::2222-:22 -device usb-net,netdev=net0\n",
      "After the guest boots, run: npm run cli -- pi-service --config pi-config.json\n",
    ]);
  });

  it("accepts operator overrides for QEMU binary, SSH port, memory, and CPU count", async () => {
    const stdout = createWriter();

    await runPiQemuSmoke(
      [
        "--config",
        "local-pi.json",
        "--image",
        "raspios.img",
        "--kernel",
        "kernel8.img",
        "--dtb",
        "pi.dtb",
        "--qemu-binary",
        "/opt/qemu/bin/qemu-system-aarch64",
        "--ssh-port",
        "2200",
        "--memory",
        "2048",
        "--cpus",
        "2",
      ],
      {
        commandExists: () => true,
        fileExists: () => true,
        spawn: vi.fn(),
        stderr: createWriter(),
        stdout,
      },
    );

    expect(stdout.writes[0]).toContain(
      "/opt/qemu/bin/qemu-system-aarch64 -machine raspi3b -m 2048 -smp 2",
    );
    expect(stdout.writes[0]).toContain("hostfwd=tcp::2200-:22");
  });

  it("shell-quotes every unsafe value in printed commands", async () => {
    const stdout = createWriter();

    await runPiQemuSmoke(
      [
        "--config",
        "config $(touch injected).json",
        "--image",
        "pi's image; reboot.img",
        "--kernel",
        "kernel `whoami`.img",
        "--dtb",
        "device tree.dtb",
        "--qemu-binary",
        "qemu binary",
      ],
      {
        commandExists: () => true,
        fileExists: () => true,
        spawn: vi.fn(),
        stderr: createWriter(),
        stdout,
      },
    );

    expect(stdout.writes[0]).toContain("'qemu binary'");
    expect(stdout.writes[0]).toContain("'kernel `whoami`.img'");
    expect(stdout.writes[0]).toContain("'device tree.dtb'");
    expect(stdout.writes[0]).toContain(
      "'file=pi'\\''s image; reboot.img,format=raw,if=sd'",
    );
    expect(stdout.writes[1]).toBe(
      "After the guest boots, run: npm run cli -- pi-service --config 'config $(touch injected).json'\n",
    );
  });

  it("runs QEMU only when --run is explicit", async () => {
    const spawn = vi.fn().mockResolvedValue(0);

    await expect(
      runPiQemuSmoke(
        [
          "--run",
          "--config",
          "pi-config.json",
          "--image",
          "pi-os.img",
          "--kernel",
          "kernel8.img",
          "--dtb",
          "pi.dtb",
        ],
        {
          commandExists: () => true,
          fileExists: () => true,
          spawn,
          stderr: createWriter(),
          stdout: createWriter(),
        },
      ),
    ).resolves.toBe(0);

    expect(spawn).toHaveBeenCalledWith("qemu-system-aarch64", [
      "-machine",
      "raspi3b",
      "-m",
      "1024",
      "-smp",
      "4",
      "-kernel",
      "kernel8.img",
      "-dtb",
      "pi.dtb",
      "-drive",
      "file=pi-os.img,format=raw,if=sd",
      "-append",
      "rw root=/dev/mmcblk0p2 rootwait console=ttyAMA0,115200",
      "-serial",
      "stdio",
      "-netdev",
      "user,id=net0,hostfwd=tcp::2222-:22",
      "-device",
      "usb-net,netdev=net0",
    ]);
  });

  it("returns an operator-facing failure when a required file is missing", async () => {
    const stderr = createWriter();

    await expect(
      runPiQemuSmoke(
        [
          "--config",
          "missing-config.json",
          "--image",
          "pi-os.img",
          "--kernel",
          "kernel8.img",
          "--dtb",
          "pi.dtb",
        ],
        {
          commandExists: () => true,
          fileExists: (path) => path !== "missing-config.json",
          spawn: vi.fn(),
          stderr,
          stdout: createWriter(),
        },
      ),
    ).resolves.toBe(1);

    expect(stderr.writes).toEqual([
      "Pi QEMU smoke failure: Config path does not exist: missing-config.json\n",
    ]);
  });

  it("returns an operator-facing failure when QEMU is unavailable", async () => {
    const stderr = createWriter();

    await expect(
      runPiQemuSmoke(
        [
          "--config",
          "pi-config.json",
          "--image",
          "pi-os.img",
          "--kernel",
          "kernel8.img",
          "--dtb",
          "pi.dtb",
        ],
        {
          commandExists: () => false,
          fileExists: () => true,
          spawn: vi.fn(),
          stderr,
          stdout: createWriter(),
        },
      ),
    ).resolves.toBe(1);

    expect(stderr.writes).toEqual([
      "Pi QEMU smoke failure: QEMU binary is not available: qemu-system-aarch64\n",
    ]);
  });

  it("rejects invalid numeric options before spawning", async () => {
    const stderr = createWriter();
    const spawn = vi.fn();

    await expect(
      runPiQemuSmoke(
        [
          "--config",
          "pi-config.json",
          "--image",
          "pi-os.img",
          "--kernel",
          "kernel8.img",
          "--dtb",
          "pi.dtb",
          "--ssh-port",
          "0",
        ],
        {
          commandExists: () => true,
          fileExists: () => true,
          spawn,
          stderr,
          stdout: createWriter(),
        },
      ),
    ).resolves.toBe(1);

    expect(spawn).not.toHaveBeenCalled();
    expect(stderr.writes).toEqual([
      "Pi QEMU smoke failure: --ssh-port must be a positive integer.\n",
    ]);
  });
});

function createWriter(): {
  write(chunk: string): boolean;
  writes: string[];
} {
  const writes: string[] = [];

  return {
    write(chunk: string): boolean {
      writes.push(chunk);

      return true;
    },
    writes,
  };
}
