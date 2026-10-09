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

export interface CoachReportPoint {
  title: string;
  line: string;
}

export interface CoachReportCluster {
  name: string;
  raw: string;
  weight: number;
  contribution: string;
}

export interface CoachReportProps {
  name?: string;
  sessionLabel: string;
  summaryLine: string;
  clusters: CoachReportCluster[];
  highlights: CoachReportPoint[];
  targets: CoachReportPoint[];
  portalUrl: string;
}

export default function CoachReport({
  name,
  sessionLabel,
  summaryLine,
  clusters,
  highlights,
  targets,
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
          {summaryLine && (
            <Section style={summaryBox}>
              <Text style={label}>Session summary</Text>
              <Text style={text}>{summaryLine}</Text>
            </Section>
          )}
          {clusters.length > 0 && (
            <>
              <Heading as="h2" style={h2}>
                Cluster breakdown
              </Heading>
              <table style={table} cellPadding={6}>
                <thead>
                  <tr>
                    <th style={th}>Cluster</th>
                    <th style={th}>Raw</th>
                    <th style={th}>Weight</th>
                    <th style={th}>Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {clusters.map((c) => (
                    <tr key={c.name}>
                      <td style={td}>{c.name}</td>
                      <td style={td}>{c.raw}</td>
                      <td style={td}>{`×${c.weight}`}</td>
                      <td style={td}>{c.contribution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <Points heading="Top highlights" points={highlights} />
          <Points heading="Top improvement targets" points={targets} />
          <Section style={buttonWrap}>
            <Button style={button} href={portalUrl}>
              Read the full report
            </Button>
          </Section>
          <Text style={muted}>
            The full report, every dimension with its reasoning, is on the
            portal. Reply to this email if anything looks wrong.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function Points({
  heading,
  points,
}: {
  heading: string;
  points: CoachReportPoint[];
}) {
  if (points.length === 0) return null;
  return (
    <>
      <Heading as="h2" style={h2}>
        {heading}
      </Heading>
      <ol style={listStyle}>
        {points.map((p) => (
          <li key={p.title} style={item}>
            <strong>{p.title}</strong>
            {p.line ? ` — ${p.line}` : ""}
          </li>
        ))}
      </ol>
    </>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = { margin: "0 auto", padding: "24px", maxWidth: "560px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#1a1a1a" };
const h2 = {
  fontSize: "17px",
  fontWeight: "bold",
  color: "#1a1a1a",
  marginTop: "24px",
};
const text = { fontSize: "15px", lineHeight: "24px", color: "#333" };
const label = {
  fontSize: "12px",
  fontWeight: "bold",
  color: "#666",
  textTransform: "uppercase" as const,
  margin: "0",
};
const muted = { fontSize: "13px", lineHeight: "20px", color: "#666" };
const summaryBox = {
  backgroundColor: "#ffffff",
  borderRadius: "8px",
  padding: "12px 16px",
};
const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: "14px",
};
const th = {
  textAlign: "left" as const,
  borderBottom: "2px solid #ddd",
  color: "#333",
};
const td = { borderBottom: "1px solid #eee", color: "#333" };
const listStyle = { paddingLeft: "20px", margin: "0" };
const item = { fontSize: "14px", lineHeight: "22px", color: "#333" };
const buttonWrap = { textAlign: "center" as const, margin: "24px 0" };
const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "15px",
  padding: "12px 20px",
  textDecoration: "none",
};
