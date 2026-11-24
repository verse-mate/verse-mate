import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Footer from "../components/layout/Footer";

describe("the footer", () => {
  it("links both llms.txt files as plain links, labelled for AI assistants", () => {
    const html = renderToStaticMarkup(<Footer />);
    const block = /For AI assistants:([\s\S]*?)<\/(p|div)>/.exec(html)?.[1] ?? "";

    expect(block).toMatch(/<a [^>]*href="https:\/\/versemate\.org\/llms\.txt"/);
    expect(block).toMatch(/<a [^>]*href="https:\/\/app\.versemate\.org\/llms\.txt"/);
  });
});
