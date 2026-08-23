/**
 * Live contract test against the real Bible Brain API.
 *
 * Opt-in: skipped unless BIBLE_BRAIN_API_KEY is set, so CI without the secret
 * stays green. Run with:
 *   BIBLE_BRAIN_API_KEY=$(grep -h KEY ~/.config/versemate/biblebrain.env | cut -d= -f2) \
 *     bun test bible-brain.live.test.ts
 *
 * These assertions encode what we actually verified upstream, so they fail loudly
 * if Bible Brain changes shape or revokes part of our licence.
 */
import { describe, expect, it } from "bun:test";
import { BibleBrainClient } from "./bible-brain.client";
import { BibleBrainService } from "./bible-brain.service";

const KEY = process.env.BIBLE_BRAIN_API_KEY;
const suite = KEY ? describe : describe.skip;

const ESV_AUDIO_NT = "ENGESVN1DA";
const ESV_TEXT = "ENGESV";
/** Documented as stream-only for our key. */
const NLT_AUDIO_NT = "ENGNLHN1DA";

function service() {
  return new BibleBrainService(new BibleBrainClient({ apiKey: KEY }));
}

suite("Bible Brain live API", () => {
  it("streams a chapter: signed url, duration and expiry", async () => {
    const audio = await service().getChapterAudio(ESV_AUDIO_NT, "JHN", 3);
    expect(audio).not.toBeNull();
    expect(audio?.url).toContain("https://");
    expect(audio?.url).toContain("Signature=");
    expect(audio?.duration_seconds).toBeGreaterThan(60);
    // Licence permits persisting ESV, so this must stay true.
    expect(audio?.offline_capable).toBe(true);
    // Signed URLs are short-lived; anything over ~2 days means our assumption broke.
    expect(audio?.expires_in_seconds).toBeGreaterThan(0);
    expect(audio?.expires_in_seconds).toBeLessThan(60 * 60 * 48);
  }, 60_000);

  it("the signed url actually serves audio bytes", async () => {
    const audio = await service().getChapterAudio(ESV_AUDIO_NT, "JHN", 3);
    const res = await fetch(audio?.url ?? "", {
      headers: { Range: "bytes=0-2047" },
    });
    expect(res.status).toBe(206);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // MP3s from this CDN begin with an ID3 tag.
    expect(String.fromCharCode(...bytes.slice(0, 3))).toBe("ID3");
  }, 90_000);

  it("returns verse timestamps aligned to the chapter", async () => {
    const svc = service();
    const [timestamps, audio] = await Promise.all([
      svc.getVerseTimestamps(ESV_AUDIO_NT, "JHN", 3),
      svc.getChapterAudio(ESV_AUDIO_NT, "JHN", 3),
    ]);
    expect(timestamps.length).toBeGreaterThan(30);
    expect(timestamps[0].verse).toBe(1);
    // Monotonic, and never past the end of the audio.
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i].seconds).toBeGreaterThanOrEqual(
        timestamps[i - 1].seconds,
      );
    }
    const duration = audio?.duration_seconds ?? 0;
    expect(timestamps[timestamps.length - 1].seconds).toBeLessThanOrEqual(
      duration,
    );
  }, 60_000);

  it("reads chapter text for a verse range", async () => {
    const verses = await service().getChapterText(ESV_TEXT, "JHN", 3, {
      verseStart: 16,
      verseEnd: 17,
    });
    expect(verses).toHaveLength(2);
    expect(verses[0].verse).toBe(16);
    expect(verses[0].text).toContain("God so loved the world");
  }, 60_000);

  it("exposes copyright text, which the UI must display", async () => {
    const rows = await service().getCopyright(ESV_TEXT);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => (r.copyright ?? "").includes("Crossway"))).toBe(
      true,
    );
  }, 60_000);

  it("permits offline download of ESV", async () => {
    const dl = await service().getDownloadable(ESV_AUDIO_NT, "JHN", 3);
    expect(dl).not.toBeNull();
    expect(dl?.filesize_bytes).toBeGreaterThan(100_000);
  }, 60_000);

  it("refuses offline download of a stream-only fileset, without erroring", async () => {
    const dl = await service().getDownloadable(NLT_AUDIO_NT, "JHN", 3);
    expect(dl).toBeNull();
    // ...while streaming the same fileset still works.
    const audio = await service().getChapterAudio(NLT_AUDIO_NT, "JHN", 3);
    expect(audio?.url).toContain("Signature=");
    expect(audio?.offline_capable).toBe(false);
  }, 90_000);

  it("lists English versions split into offline-capable and stream-only", async () => {
    const versions = await service().listVersions("eng");
    expect(versions.length).toBeGreaterThan(5);

    const offline = versions.filter((v) => v.offline_capable);
    const streamOnly = versions.filter(
      (v) => !v.offline_capable && v.audio_filesets.length > 0,
    );
    // The product relies on both buckets being non-empty.
    expect(offline.length).toBeGreaterThan(0);
    expect(streamOnly.length).toBeGreaterThan(0);

    const esv = versions.find((v) => v.abbr === "ENGESV");
    expect(esv?.offline_capable).toBe(true);
    expect(esv?.has_verse_timing).toBe(true);
  }, 180_000);
});
