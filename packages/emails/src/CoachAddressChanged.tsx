import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export interface CoachAddressChangedProps {
  name?: string;
  replyTo: string;
}

export default function CoachAddressChanged({
  name,
  replyTo,
}: CoachAddressChangedProps) {
  return (
    <Html>
      <Head />
      <Preview>Your VerseMate coaching address was changed</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your coaching address was changed</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            A program admin changed the email address your VerseMate coaching
            reports go to. Reports and notes are no longer sent to this address.
          </Text>
          <Text style={muted}>
            If you did not expect this, reply to this email or write to{" "}
            {replyTo} so the change can be checked.
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
