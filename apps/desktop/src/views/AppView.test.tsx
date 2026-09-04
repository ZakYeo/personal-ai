import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PresentationControl } from "../../../../src/presentation-contract.js";
import type { DesktopPresentationState } from "../model/desktop-state.js";
import type { DesktopHost } from "../ports/desktop-host.js";
import { createDesktopAppViewModel } from "../view-models/desktop-app-view-model.js";
import { AppView } from "./AppView.js";

const state: DesktopPresentationState = {
  connection: "connected",
  projection: {
    activity: [{ occurredAt: "10:00", summary: "Voice request completed" }],
    alarms: [
      {
        id: "alarm-1",
        label: "Tea",
        scheduledFor: "11:00",
        status: "scheduled",
      },
    ],
    integrations: [{ label: "Calendar", status: "ready" }],
    interactions: [
      { id: "turn-1", request: "What is next?", response: "Tea at 11." },
    ],
    profile: [
      {
        field: "preferredName",
        provenance: "user-authored",
        value: "Zak",
      },
    ],
    sources: [{ title: "Calendar", url: "https://example.com/calendar" }],
    tasks: [{ id: "task-1", label: "Submit form", status: "open" }],
    today: ["Tea at 11", "Submit form"],
  },
  snapshot: {
    instanceId: "service-1",
    interaction: {
      confirmation: { prompt: "Set an alarm for 11am?" },
      id: "interaction-1",
      phase: "confirmation",
      transcript: "set an alarm for tea",
      updatedAt: "2026-09-04T10:00:00.000Z",
    },
    microphone: "available",
    sequence: 4,
    wakeListening: false,
  },
};

function createHost(sendFails = false) {
  const autostart: boolean[] = [];
  const controls: PresentationControl[] = [];
  const host: DesktopHost = {
    hideCurrentWindow: () => Promise.resolve(),
    initialize: () => Promise.resolve(),
    isAutostartEnabled: () => Promise.resolve(false),
    openSource: () => Promise.resolve(),
    sendControl: (control) => {
      controls.push(control);
      return sendFails
        ? Promise.reject(new Error("private host failure"))
        : Promise.resolve({ status: "accepted" as const });
    },
    setAutostart: (enabled) => {
      autostart.push(enabled);
      return Promise.resolve();
    },
    setPushToTalkShortcut: () => Promise.resolve(),
    showOverlay: () => Promise.resolve(),
  };
  return { autostart, controls, host };
}

describe("desktop application", () => {
  it("renders exact confirmation controls in the compact overlay", async () => {
    const { controls, host } = createHost();
    const viewModel = createDesktopAppViewModel({
      host,
      initialState: state,
      mode: "overlay",
    });
    render(<AppView viewModel={viewModel} />);

    expect(screen.getByText("Set an alarm for 11am?")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(controls).toEqual([
      expect.objectContaining({
        interactionId: "interaction-1",
        type: "confirm",
      }),
    ]);
  });

  it("provides every documented command-center view", async () => {
    const { host } = createHost();
    const viewModel = createDesktopAppViewModel({
      host,
      initialState: state,
      mode: "command-center",
    });
    render(<AppView viewModel={viewModel} />);

    for (const label of viewModel.getSnapshot().commandCenter.sections) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }

    await userEvent.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByText("Submit form")).toBeVisible();
  });

  it("shows offline state without hiding the dashboard", () => {
    const { host } = createHost();
    const viewModel = createDesktopAppViewModel({
      host,
      initialState: { ...state, connection: "offline" },
      mode: "command-center",
    });
    render(<AppView viewModel={viewModel} />);

    expect(screen.getByText("Service offline")).toBeVisible();
    expect(screen.getByText("Tea at 11")).toBeVisible();
  });

  it("contains host control failures behind safe view-model feedback", async () => {
    const { host } = createHost(true);
    const viewModel = createDesktopAppViewModel({
      host,
      initialState: state,
      mode: "command-center",
    });
    render(<AppView viewModel={viewModel} />);

    await userEvent.type(screen.getByLabelText("Ask Jarvis"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(
      await screen.findByText(
        "The desktop service could not accept that request.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("private host failure")).not.toBeInTheDocument();
  });

  it("surfaces safe service rejections from correlated control results", async () => {
    const { host } = createHost();
    const viewModel = createDesktopAppViewModel({
      host: {
        ...host,
        sendControl: () =>
          Promise.resolve({
            message: "That confirmation was already answered.",
            status: "rejected",
          }),
      },
      initialState: state,
      mode: "overlay",
    });
    render(<AppView viewModel={viewModel} />);

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("That confirmation was already answered."),
    ).toBeVisible();
  });

  it("emits typed profile explanation, correction, and deletion controls", async () => {
    const { controls, host } = createHost();
    const viewModel = createDesktopAppViewModel({
      host,
      initialState: state,
      mode: "command-center",
    });
    render(<AppView viewModel={viewModel} />);

    await userEvent.click(screen.getByRole("button", { name: "Profile" }));
    const name = screen.getByLabelText("Preferred Name");
    await userEvent.clear(name);
    await userEvent.type(name, "Zachary");
    await userEvent.click(
      screen.getByRole("button", { name: "Save correction" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Why is this saved?" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Forget" }));

    expect(controls).toEqual([
      expect.objectContaining({
        field: "preferredName",
        type: "profile_set",
        value: "Zachary",
      }),
      expect.objectContaining({
        field: "preferredName",
        type: "profile_explain",
      }),
      expect.objectContaining({
        field: "preferredName",
        type: "profile_forget",
        value: "Zak",
      }),
    ]);
  });

  it("requires an explicit settings action before enabling autostart", async () => {
    const { autostart, host } = createHost();
    const viewModel = createDesktopAppViewModel({
      host,
      initialState: state,
      mode: "command-center",
    });
    render(<AppView viewModel={viewModel} />);

    expect(autostart).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Start with this computer/u }),
    );

    expect(autostart).toEqual([true]);
  });
});
