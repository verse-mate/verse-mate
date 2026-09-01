import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import coachPlugin from "./coach.plugin";

const app = new Elysia().use(coachPlugin);

/**
 * Tasks 6.3b and 8.5a. These endpoints send email to a leader in VerseMate's
 * name and change a session's retrieval state, so the guard is the point: an
 * unauthenticated caller must get nowhere near them.
 */
describe("the re-share admin surface is guarded", () => {
  it("listing pending requests requires authentication", async () => {
    const res = await app.handle(
      new Request("http://localhost/coach/admin/reshares"),
    );
    expect(res.status).toBe(401);
  });

  it("SENDING a request requires authentication", async () => {
    // The one that emails a leader. An unguarded endpoint would let anyone who
    // knows a session id send mail in VerseMate's name.
    const res = await app.handle(
      new Request("http://localhost/coach/admin/reshares/ff-1/send", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("RESOLVING a request requires authentication", async () => {
    const res = await app.handle(
      new Request("http://localhost/coach/admin/reshares/ff-1/resolve", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("none of them leak whether the session exists", async () => {
    // A 401 for a real id and a 404 for a fake one would enumerate sessions.
    const real = await app.handle(
      new Request("http://localhost/coach/admin/reshares/ff-1/send", {
        method: "POST",
      }),
    );
    const fake = await app.handle(
      new Request("http://localhost/coach/admin/reshares/does-not-exist/send", {
        method: "POST",
      }),
    );
    expect(real.status).toBe(fake.status);
  });
});
