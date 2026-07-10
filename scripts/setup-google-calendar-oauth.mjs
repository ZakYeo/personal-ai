import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { URL, URLSearchParams } from "node:url";

const scope = "https://www.googleapis.com/auth/calendar.events.readonly";
const tokenUrl = "https://oauth2.googleapis.com/token";

const clientId = readRequiredEnv("GOOGLE_CALENDAR_CLIENT_ID");
const clientSecret = readRequiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET");
const codeVerifier = base64Url(randomBytes(64));
const codeChallenge = base64Url(
  createHash("sha256").update(codeVerifier).digest(),
);
const state = base64Url(randomBytes(32));

const server = createServer();

server.listen(0, "127.0.0.1", () => {
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new TypeError("Could not resolve OAuth loopback address.");
  }

  const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
  const authorizationUrl = new URL(
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", scope);
  authorizationUrl.searchParams.set("state", state);

  console.log("Open this URL in your browser and approve calendar access:");
  console.log(authorizationUrl.toString());
});

server.on("request", async (request, response) => {
  try {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? "127.0.0.1"}`,
    );

    if (requestUrl.pathname !== "/oauth2/callback") {
      response.writeHead(404);
      response.end("Not found.");
      return;
    }

    const error = requestUrl.searchParams.get("error");

    if (error) {
      throw new Error(`Google OAuth returned error: ${error}`);
    }

    if (requestUrl.searchParams.get("state") !== state) {
      throw new Error("Google OAuth state did not match.");
    }

    const code = requestUrl.searchParams.get("code");

    if (!code) {
      throw new Error("Google OAuth callback did not include a code.");
    }

    const redirectUri = `http://127.0.0.1:${server.address().port}/oauth2/callback`;
    const tokenResponse = await globalThis.fetch(tokenUrl, {
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const tokenBody = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(
        `Google OAuth token exchange failed with status ${tokenResponse.status}.`,
      );
    }

    if (
      !isRecord(tokenBody) ||
      typeof tokenBody.refresh_token !== "string" ||
      tokenBody.refresh_token.length === 0
    ) {
      throw new Error(
        "Google OAuth token response did not include a refresh_token. Revoke the app grant and run again, or keep prompt=consent enabled.",
      );
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end(
      "Google Calendar authorization complete. You can close this tab.",
    );
    console.log("Add this line to .env:");
    console.log(`GOOGLE_CALENDAR_REFRESH_TOKEN=${tokenBody.refresh_token}`);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("Google Calendar authorization failed. Check the terminal.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

function readRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }

  return value;
}

function base64Url(value) {
  return value
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
