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

export interface VerifyEmailProps {
  href: string;
}

export default function VerifyEmail({ href }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your VerseMate email address</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Confirm your email address</Heading>
          <Text style={text}>
            Confirm this address for your VerseMate account.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Link style={button} href={href}>
              Confirm my email
            </Link>
          </Section>
          <Text style={muted}>
            Or open this link: <Link href={href}>{href}</Link>
          </Text>
          <Text style={muted}>
            The link works for one hour. If you did not ask for it, ignore this
            email.
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
