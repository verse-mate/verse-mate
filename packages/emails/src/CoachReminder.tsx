import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CoachReminderItem {
  title: string;
  detail?: string;
}

export interface CoachReminderProps {
  name?: string;
  classDay: string;
  strengths: CoachReminderItem[];
  recommendations: CoachReminderItem[];
}

export default function CoachReminder({
  name,
  classDay,
  strengths,
  recommendations,
}: CoachReminderProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Before ${classDay}'s class: what to keep doing and what to work on`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Before {classDay}'s class</Heading>
          <Text style={text}>{name ? `Hi ${name},` : "Hi,"}</Text>
          <Text style={text}>
            A quick reminder from your last coaching report: what went well to
            keep doing, and what to work on in your next class.
          </Text>
          <Section>
            <Text style={keep}>Keep doing</Text>
            <ItemList items={strengths} />
          </Section>
          <Section>
            <Text style={work}>Work on</Text>
            <ItemList items={recommendations} />
          </Section>
          <Text style={footer}>VerseMate Bible Leader Coach</Text>
        </Container>
      </Body>
    </Html>
  );
}

function ItemList({ items }: { items: CoachReminderItem[] }) {
  return (
    <ol style={list}>
      {items.map((item) => (
        <li key={item.title} style={listItem}>
          <strong>{item.title}</strong>
          {item.detail ? ` ${item.detail}` : null}
        </li>
      ))}
    </ol>
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
const keep = {
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  color: "#059669",
  margin: "24px 0 8px",
};
const work = { ...keep, color: "#B45309" };
const list = { margin: "0", padding: "0 0 0 20px" };
const listItem = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#334155",
  margin: "0 0 12px",
};
const footer = { fontSize: "13px", color: "#64748b", margin: "32px 0 0" };
