import { createDeferredNotificationDelivery } from "./deferred-notification-delivery.js";

describe("createDeferredNotificationDelivery", () => {
  it("forwards through one bound delivery port", async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const deferred = createDeferredNotificationDelivery();

    deferred.bind({ deliver });
    await deferred.port.deliver({ id: "alarm-1", text: "Alarm: tea." }, {});

    expect(deliver).toHaveBeenCalledExactlyOnceWith(
      { id: "alarm-1", text: "Alarm: tea." },
      {},
    );
    expect(() => deferred.bind({ deliver })).toThrow(
      "Notification delivery is already bound.",
    );
  });

  it("fails before a delivery port is bound", () => {
    const deferred = createDeferredNotificationDelivery();

    expect(() =>
      deferred.port.deliver({ id: "alarm-1", text: "Alarm: tea." }, {}),
    ).toThrow("Notification delivery is not bound.");
  });
});
