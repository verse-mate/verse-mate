import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CoachNoteProps {
  /** Leader's display name (falls back to a generic greeting when empty). */
  name?: string;
  /** The session this note is about, e.g. "James, Lesson 9 — July 18, 2026". */
  sessionLabel: string;
  /** The note body (plain text; paragraphs split on blank lines). */
  body: string;
  /** Deep link to the session in the coach portal (optional). */
  portalUrl?: string;
}

/**
 * Sent to a Bible-study leader when their coach writes a note on one of their
 * sessions. Mirrors the note shown on the leader's own portal dashboard.
 */
export default function CoachNote({
  name,
  sessionLabel,
  body,
  portalUrl,
}: CoachNoteProps) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <Html>
      <Head />
      <Preview>A coaching note on {sessionLabel}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>A note from your coach</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={label}>Re: {sessionLabel}</Text>
          <Section style={quote}>
            {paragraphs.length > 0 ? (
              paragraphs.map((p, i) => (
                // Order is stable (paragraph split of a fixed string).
                // biome-ignore lint/suspicious/noArrayIndexKey: static content
                <Text key={i} style={text}>
                  {p}
                </Text>
              ))
            ) : (
              <Text style={text}>{body}</Text>
            )}
          </Section>
          {portalUrl ? (
            <Section style={{ textAlign: "center", margin: "24px 0 4px" }}>
              <Link style={button} href={portalUrl}>
                View in the coaching portal
              </Link>
            </Section>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f6f4", fontFamily: "Arial, sans-serif" };
const container = {
  margin: "0 auto",
  padding: "24px",
  maxWidth: "560px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
};
const h1 = { fontSize: "22px", color: "#0F172A", margin: "0 0 12px" };
const text = { fontSize: "15px", lineHeight: "1.6", color: "#334155" };
const label = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#64748b",
  margin: "0 0 8px",
};
const quote = {
  borderLeft: "3px solid #0284C7",
  padding: "4px 16px",
  backgroundColor: "#f8fafc",
  borderRadius: "0 8px 8px 0",
};
const button = {
  backgroundColor: "#0284C7",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "15px",
  fontWeight: 600,
};
