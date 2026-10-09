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

export interface CoachAddressConfirmProps {
  name?: string;
  confirmUrl: string;
  days: number;
  replyTo: string;
}

export default function CoachAddressConfirm({
  name,
  confirmUrl,
  days,
  replyTo,
}: CoachAddressConfirmProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your VerseMate coaching address</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Confirm your coaching address</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            A program admin asked for your VerseMate coaching reports to be sent
            to this address. Nothing changes until you confirm it.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Link style={button} href={confirmUrl}>
              Review and confirm
            </Link>
          </Section>
          <Text style={muted}>
            The link works once and expires in {days} days. If you did not
            expect this, ignore it, or write to {replyTo}.
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
