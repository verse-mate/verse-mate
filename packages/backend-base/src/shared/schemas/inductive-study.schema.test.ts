import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

import { StoredStudySchema } from "./inductive-study.schema";

const served = async (content: unknown) => {
  const app = new Elysia()
    .onError(({ set }) => {
      set.status = 500;
      return "refused";
    })
    .get("/study", () => content, { response: { 200: StoredStudySchema } });
  const response = await app.handle(new Request("http://localhost/study"));
  return { status: response.status, body: await response.text() };
};

describe("a stored chapter study is served as it is stored", () => {
  it("keeps a step of a kind the study shape does not list", async () => {
    const content = {
      bookId: 59,
      chapter: 3,
      steps: [
        { number: 1, kind: "timeline", title: "When", marks: ["3:1"] },
        { number: 2, kind: "bullets", title: "Notes", items: [{ text: "x" }] },
      ],
    };
    expect(await served(content)).toEqual({
      status: 200,
      body: JSON.stringify(content),
    });
  });
});
