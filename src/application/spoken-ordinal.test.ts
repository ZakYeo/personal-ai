import { parseSpokenOrdinal } from "./spoken-ordinal.js";

describe("spoken ordinal parsing", () => {
  it.each([
    ["the first one", 1],
    ["SECOND event", 2],
    ["what about the tenth?", 10],
    ["eleventh", undefined],
    ["firstly", undefined],
  ])("parses %j as %j", (text, ordinal) => {
    expect(parseSpokenOrdinal(text)).toBe(ordinal);
  });
});
