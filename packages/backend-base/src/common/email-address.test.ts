import { describe, expect, it } from "bun:test";

import { isEmailAddress, isSingleRecipient } from "./email-address";

describe("one deliverable email address, nothing more", () => {
  it.each([
    "leader@example.org",
    "first.last+coach@mail.example.co.uk",
    "a_b%c-d@example-domain.org",
  ])("accepts %s", (address) => {
    expect(isEmailAddress(address)).toBe(true);
  });

  it.each([
    "a@example.org,b@example.org",
    "a@example.org;b@example.org",
    "Leader <leader@example.org>",
    '"quoted"@example.org',
    "a b@example.org",
    "leader@example.org.",
    "leader@needs-real-email.invalid.",
    "leader.@example.org",
    ".leader@example.org",
    "lea..der@example.org",
    "leader@example",
    "leader@exa_mple.org",
    "leader@@example.org",
    "",
  ])("refuses %p", (address) => {
    expect(isEmailAddress(address)).toBe(false);
  });
});

describe("the sender's guard lets one address through and nothing that adds a second", () => {
  it.each(["o'brien@example.org", "leader@example.org"])(
    "passes %p",
    (address) => {
      expect(isSingleRecipient(address)).toBe(true);
    },
  );

  it.each([
    "a@example.org,b@example.org",
    "a@example.org; b@example.org",
    "Leader <a@example.org>",
    '"a"@example.org',
    "a@b@example.org",
    "first,second@example.org",
    "first@example.org,",
  ])("stops %p", (address) => {
    expect(isSingleRecipient(address)).toBe(false);
  });
});

describe("an address is at most 254 characters", () => {
  const local = "a".repeat(64);
  const at = (length: number) =>
    `${local}@${"x".repeat(length - local.length - 1 - ".org".length)}.org`;

  it("accepts one of exactly 254", () => {
    expect(at(254)).toHaveLength(254);
    expect(isEmailAddress(at(254))).toBe(true);
  });

  it("refuses one of 255", () => {
    expect(at(255)).toHaveLength(255);
    expect(isEmailAddress(at(255))).toBe(false);
  });
});
