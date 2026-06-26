import {
  createAppError,
  mapAppErrorToResponse,
  type AppErrorCategory,
} from "./app-error.js";

describe("mapAppErrorToResponse", () => {
  it.each<{
    category: AppErrorCategory;
    expectedStatus: "invalid" | "needs_confirmation" | "unsupported" | "error";
    expectedText: string;
  }>([
    {
      category: "validation",
      expectedStatus: "invalid",
      expectedText:
        "I could not use that command: alarm.create requires minutesFromNow.",
    },
    {
      category: "confirmation_required",
      expectedStatus: "needs_confirmation",
      expectedText:
        "I need confirmation before doing that. Please confirm yes or no.",
    },
    {
      category: "unsupported",
      expectedStatus: "unsupported",
      expectedText: "I do not have an enabled feature for alarm.create.",
    },
    {
      category: "feature_failure",
      expectedStatus: "error",
      expectedText: "I could not complete that command.",
    },
    {
      category: "unexpected",
      expectedStatus: "error",
      expectedText: "I hit a problem and could not complete that.",
    },
  ])("maps $category errors", ({ category, expectedStatus, expectedText }) => {
    expect(
      mapAppErrorToResponse(
        createAppError({
          category,
          capability: "alarm.create",
          message:
            category === "validation"
              ? "alarm.create requires minutesFromNow."
              : "fixture failure",
        }),
      ),
    ).toEqual({
      status: expectedStatus,
      text: expectedText,
    });
  });

  it("uses explicit public text for feature failures without exposing diagnostics", () => {
    expect(
      mapAppErrorToResponse(
        createAppError({
          category: "feature_failure",
          capability: "alarm.create",
          cause: new Error("provider token secret fixture failure"),
          message: "provider token secret fixture failure",
          publicMessage: "I could not set that alarm.",
        }),
      ),
    ).toEqual({
      status: "error",
      text: "I could not set that alarm.",
    });
  });
});
