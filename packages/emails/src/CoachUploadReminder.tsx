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

export interface CoachUploadReminderProps {
  name?: string;
  uploadUrl: string;
}

export default function CoachUploadReminder({
  name,
  uploadUrl,
}: CoachUploadReminderProps) {
  return (
    <Html>
      <Head />
      <Preview>Did your group meet this week?</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Did your group meet this week?</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            We did not receive a recording of your session this past week. If
            your group met, you can upload the video of the session in the
            portal and your coaching report will follow.
          </Text>
          <Section style={buttonWrap}>
            <Button style={button} href={uploadUrl}>
              Upload your session
            </Button>
          </Section>
          <Text style={muted}>
            If you did not meet this week, nothing is needed. Thank you for
            leading your group.
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
