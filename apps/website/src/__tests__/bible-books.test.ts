import { describe, expect, it } from "bun:test";
import { neighbours } from "../lib/bible-books";

describe("the order of the books", () => {
  it("gives Genesis no previous book and Revelation no next", () => {
    expect(neighbours("genesis").previous).toBeUndefined();
    expect(neighbours("genesis").next?.slug).toBe("exodus");
    expect(neighbours("revelation").next).toBeUndefined();
    expect(neighbours("revelation").previous?.slug).toBe("jude");
  });

  it("puts Romans between Acts and 1 Corinthians, and Matthew after Malachi", () => {
    expect(neighbours("romans").previous?.slug).toBe("acts");
    expect(neighbours("romans").next?.slug).toBe("1-corinthians");
    expect(neighbours("malachi").next?.slug).toBe("matthew");
  });
});
