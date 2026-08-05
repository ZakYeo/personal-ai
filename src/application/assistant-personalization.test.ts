import { renderAssistantPersonalization } from "./assistant-personalization.js";

describe("renderAssistantPersonalization", () => {
  it("renders only the narrow stored name and response-style preferences", () => {
    expect(
      renderAssistantPersonalization({
        preferredName: 'Zak "Z"',
        responseStyle: "concise",
      }),
    ).toContain(
      'User personalization data: {"preferredName":"Zak \\"Z\\"","responseStyle":"concise"}.',
    );
  });

  it("omits the personalization instruction when no values are stored", () => {
    expect(renderAssistantPersonalization({})).toBeUndefined();
  });
});
