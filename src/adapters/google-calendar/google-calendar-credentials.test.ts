import { createGoogleCalendarConfig } from "../../test-support/adapter-contract.js";
import { resolveGoogleCalendarCredentials } from "./google-calendar-credentials.js";

describe("resolveGoogleCalendarCredentials", () => {
  it("prefers a configured access token over refresh credentials", () => {
    expect(
      resolveGoogleCalendarCredentials({
        config: createGoogleCalendarConfig(),
        env: {
          GOOGLE_CALENDAR_ACCESS_TOKEN: "access-token",
          GOOGLE_CALENDAR_CLIENT_ID: "client-id",
          GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
          GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
        },
      }),
    ).toEqual({ accessToken: "access-token", kind: "access-token" });
  });

  it("resolves the complete refresh credential set", () => {
    expect(
      resolveGoogleCalendarCredentials({
        config: createGoogleCalendarConfig(),
        env: {
          GOOGLE_CALENDAR_CLIENT_ID: "client-id",
          GOOGLE_CALENDAR_CLIENT_SECRET: "client-secret",
          GOOGLE_CALENDAR_REFRESH_TOKEN: "refresh-token",
        },
      }),
    ).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      kind: "refresh-token",
      refreshToken: "refresh-token",
    });
  });

  it("reports the first missing refresh credential through caller policy", () => {
    expect(() =>
      resolveGoogleCalendarCredentials({
        config: createGoogleCalendarConfig(),
        createMissingCredentialError: ({ envName }) =>
          new Error(`missing ${envName}`),
        env: {},
      }),
    ).toThrow("missing GOOGLE_CALENDAR_CLIENT_ID");
  });
});
