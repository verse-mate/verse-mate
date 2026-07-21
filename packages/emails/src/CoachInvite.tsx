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

export interface CoachInviteProps {
  /** Leader's display name (falls back to a generic greeting when empty). */
  name?: string;
  /** Who added them, e.g. "Bryan Bailey" (optional). */
  invitedBy?: string;
  /** Where to sign in to the coach portal. */
  portalUrl: string;
}

/**
 * Sent when a program admin adds a new Bible-study leader to the coaching
 * portal. Points them at the portal to sign in with the invited email.
 */
export default function CoachInvite({
  name,
  invitedBy,
  portalUrl,
}: CoachInviteProps) {
  return (
    <Html>
      <Head />
      <Preview>You've been added to the VerseMate coaching portal</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to VerseMate Coaching</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            {invitedBy ? `${invitedBy} has` : "You've been"} added you to the
            VerseMate Bible-study coaching portal. After each recorded session
            you'll receive coaching feedback here — scores, strengths, and
            specific, transferable next steps.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Link style={button} href={portalUrl}>
              Open the coaching portal
            </Link>
          </Section>
          <Text style={muted}>
            Sign in with this email address to see your dashboard. If you don't
            have an account yet, create one with this same email.
          </Text>
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
const muted = { fontSize: "13px", lineHeight: "1.6", color: "#64748b" };
const button = {
  backgroundColor: "#0284C7",
  color: "#ffffff",
  padding: "12px 20px",
  borderRadius: "8px",
  textDecoration: "none",
  fontSize: "15px",
  fontWeight: 600,
};
