import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface CoachReshareRequestProps {
  /** Leader's display name (falls back to a generic greeting when empty). */
  name?: string;
  /** The session whose recording could not be retrieved. */
  sessionLabel: string;
  /** How many times retrieval was attempted before asking. */
  attempts: number;
}

/**
 * Asks a leader to re-share a session recording VerseMate could not retrieve
 * (task 6.3b).
 *
 * Sent through Mailgun, because the coach mailbox that sent this on the old
 * host is gone with the email path (design D6). It says what was tried, so the
 * request does not read as the system having simply not bothered.
 */
export default function CoachReshareRequest({
  name,
  sessionLabel,
  attempts,
}: CoachReshareRequestProps) {
  return (
    <Html>
      <Head />
      <Preview>{`We couldn't retrieve the recording for ${sessionLabel}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Could you re-share a recording?</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            We tried {attempts} times to retrieve the recording for{" "}
            <strong>{sessionLabel}</strong> and could not, usually this means
            downloads are turned off for the link, or the recording has been
            removed.
          </Text>
          <Text style={text}>
            Reply to this email with a shareable link (downloads enabled) and
            we'll pick it up automatically. No report is produced for this
            session until we can see the recording, we don't score a session
            from partial material.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = { margin: "0 auto", padding: "24px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#1a1a1a" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#333" };
