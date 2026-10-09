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

export interface CoachIdentityNudgeProps {
  name?: string;
  hasAccount: boolean;
  portalUrl: string;
}

export default function CoachIdentityNudge({
  name,
  hasAccount,
  portalUrl,
}: CoachIdentityNudgeProps) {
  return (
    <Html>
      <Head />
      <Preview>
        {hasAccount
          ? "Confirm your email to see your coaching reports"
          : "Create your account to see your coaching reports"}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your coaching reports are waiting</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            {hasAccount
              ? "Your VerseMate account has not confirmed this email address yet. Sign in to the coaching portal and confirm it, and your coaching reports will appear."
              : "Your coaching reports are kept for this email address. Create your VerseMate account with this address, confirm it, and your reports will appear."}
          </Text>
          <Section style={buttonWrap}>
            <Button style={button} href={portalUrl}>
              Open the coaching portal
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = { margin: "0 auto", padding: "24px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#1a1a1a" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#333" };
const buttonWrap = { textAlign: "center" as const, margin: "24px 0" };
const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  padding: "12px 20px",
  textDecoration: "none",
};
