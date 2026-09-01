import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CoachReportProps {
  /** Leader's display name (falls back to a generic greeting when empty). */
  name?: string;
  /** The session this report is about, e.g. "Obadiah — 22 August 2026". */
  sessionLabel: string;
  /** Composite score out of 100. */
  score: number;
  /** Band label, e.g. "Strong". */
  status: string;
  /** One-line summary from the report's feedback headline. */
  headline: string;
  /** Deep link to the session in the coach portal, by its immutable id. */
  portalUrl: string;
}

/**
 * A leader's session coaching report.
 *
 * Carries a prominent portal link and NO ATTACHMENT (task 6.3). The report
 * lives on the portal, addressed by its immutable id, so the link keeps working
 * after a re-score and there is no PDF to fall out of step with what the portal
 * shows.
 */
export default function CoachReport({
  name,
  sessionLabel,
  score,
  status,
  headline,
  portalUrl,
}: CoachReportProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Your coaching report for ${sessionLabel}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your coaching report</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            Here is the coaching report for <strong>{sessionLabel}</strong>.
          </Text>
          <Section style={scoreBox}>
            <Text style={scoreText}>
              {score} / 100 — {status}
            </Text>
          </Section>
          <Text style={text}>{headline}</Text>
          <Section style={buttonWrap}>
            <Button style={button} href={portalUrl}>
              Read the full report
            </Button>
          </Section>
          <Text style={muted}>
            The full breakdown — every dimension, its score and the reasoning —
            is on the portal. Reply to this email if anything looks wrong.
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
const muted = { fontSize: "13px", lineHeight: "20px", color: "#666" };
const scoreBox = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center" as const,
};
const scoreText = { fontSize: "20px", fontWeight: "bold", color: "#1a1a1a" };
const buttonWrap = { textAlign: "center" as const, margin: "24px 0" };
const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  padding: "12px 20px",
  textDecoration: "none",
};
