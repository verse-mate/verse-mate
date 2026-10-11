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

export interface ResetPasswordProps {
  href: string;
}

export default function ResetPassword({ href }: ResetPasswordProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your VerseMate password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Reset your password</Heading>
          <Text style={text}>
            Someone asked to reset the password of the VerseMate account on this
            address.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Link style={button} href={href}>
              Choose a new password
            </Link>
          </Section>
          <Text style={muted}>
            Or open this link: <Link href={href}>{href}</Link>
          </Text>
          <Text style={muted}>
            The link works for one hour. If you did not ask for it, ignore this
            email; your password stays as it is.
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
