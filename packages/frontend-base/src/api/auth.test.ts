import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { exchangeSSOCode } from "./auth";

const VERIFIER = "v".repeat(43);
const CODE = "c".repeat(43);

let cookies: string[] = [];
let fetchSpy: ReturnType<typeof spyOn>;
const requests: { url: string; body: string | null }[] = [];

function refusedResponse(url: string): Response {
  const response = new Response(
    JSON.stringify({ message: "Invalid or expired sign-in code" }),
    { status: 401, headers: { "content-type": "application/json" } },
  );
  Object.defineProperty(response, "url", { value: url });
  Object.defineProperty(response, "clone", {
    value: () => refusedResponse(url),
  });
  return response;
}

describe("admin SSO code exchange", () => {
  beforeEach(() => {
    cookies = [];
    requests.length = 0;
    (global as any).window = {
      location: {
        href: "http://localhost:3000/auth/callback/google",
        origin: "http://localhost:3000",
        pathname: "/auth/callback/google",
        protocol: "http:",
      },
    };
    (global as any).document = {
      get cookie() {
        return cookies.join("; ");
      },
      set cookie(value: string) {
        cookies.push(value.split(";")[0]);
      },
    };
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input instanceof Request ? input.url : input);
      requests.push({ url, body: (init?.body as string) ?? null });
      return refusedResponse(url);
    }) as typeof fetch);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    Reflect.deleteProperty(global, "window");
    Reflect.deleteProperty(global, "document");
  });

  it("posts the code with the verifier", async () => {
    await exchangeSSOCode(CODE, VERIFIER).catch(() => undefined);

    expect(requests[0].url).toEndWith("/auth/sso/exchange");
    expect(JSON.parse(requests[0].body ?? "{}")).toEqual({
      code: CODE,
      verifier: VERIFIER,
    });
  });

  it("does not try a token refresh when the code is refused", async () => {
    cookies.push("refreshToken=placeholder-refresh");

    await expect(exchangeSSOCode(CODE, VERIFIER)).rejects.toBeDefined();

    expect(requests.map((r) => new URL(r.url).pathname)).toEqual([
      "/auth/sso/exchange",
    ]);
  });

  it("stays on the callback page instead of sending the user to /logout", async () => {
    await expect(exchangeSSOCode(CODE, VERIFIER)).rejects.toBeDefined();

    expect((global as any).window.location.href).toBe(
      "http://localhost:3000/auth/callback/google",
    );
  });
});
