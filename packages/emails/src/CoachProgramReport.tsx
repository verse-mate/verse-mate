import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
} from "@react-email/components";

export interface CoachProgramReportProps {
  monthLabel: string;
  leaderboard: Array<{ name: string; composite: string; status: string }>;
  highlights: string[];
  programUrl: string;
  summaries: Array<{ name: string; url: string }>;
}

export default function CoachProgramReport({
  monthLabel,
  leaderboard,
  highlights,
  programUrl,
  summaries,
}: CoachProgramReportProps) {
  return (
    <Html>
      <Head />
      <Preview>{`The coaching program in ${monthLabel}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{`The program in ${monthLabel}`}</Heading>
          <Heading as="h2" style={h2}>
            Leaderboard
          </Heading>
          <table style={table} cellPadding={6}>
            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.name}>
                  <td style={td}>{i + 1}</td>
                  <td style={td}>{row.name}</td>
                  <td style={td}>{row.composite}</td>
                  <td style={td}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {highlights.length > 0 && (
            <>
              <Heading as="h2" style={h2}>
                Highlights
              </Heading>
              <ul style={list}>
                {highlights.map((h) => (
                  <li key={h} style={item}>
                    {h}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Section style={buttonWrap}>
            <Button style={button} href={programUrl}>
              Read the program report
            </Button>
          </Section>
          <Heading as="h2" style={h2}>
            Each leader's summary
          </Heading>
          <ul style={list}>
            {summaries.map((s) => (
              <li key={s.url} style={item}>
                <Link href={s.url}>{s.name}</Link>
              </li>
            ))}
          </ul>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f9fc", fontFamily: "sans-serif" };
const container = { margin: "0 auto", padding: "24px", maxWidth: "600px" };
const h1 = { fontSize: "22px", fontWeight: "bold", color: "#1a1a1a" };
const h2 = {
  fontSize: "17px",
  fontWeight: "bold",
  color: "#1a1a1a",
  marginTop: "24px",
};
const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: "14px",
};
const td = { borderBottom: "1px solid #eee", color: "#333" };
const list = { paddingLeft: "20px", margin: "0" };
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
