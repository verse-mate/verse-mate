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

export interface CoachMonthlySummaryProps {
  name?: string;
  monthLabel: string;
  portalUrl: string;
}

export default function CoachMonthlySummary({
  name,
  monthLabel,
  portalUrl,
}: CoachMonthlySummaryProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Your coaching summary for ${monthLabel}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your month in review</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            Thank you for leading your group through {monthLabel}. Your summary
            gathers every session of the month: what went well, where to grow
            next, and a few questions to talk through with your coach.
          </Text>
          <Section style={buttonWrap}>
            <Button style={button} href={portalUrl}>
              Read your {monthLabel} summary
            </Button>
          </Section>
          <Text style={muted}>
            Reply to this email if anything looks wrong.
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
const buttonWrap = { textAlign: "center" as const, margin: "24px 0" };
const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  padding: "12px 20px",
  textDecoration: "none",
};
