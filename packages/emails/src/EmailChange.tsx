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
import type { ReactNode } from "react";

function Layout({
  preview,
  title,
  children,
}: {
  preview: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{title}</Heading>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

export function ConfirmEmailChange({ href }: { href: string }) {
  return (
    <Layout
      preview="Confirm your new VerseMate email address"
      title="Confirm your new email address"
    >
      <Text style={text}>
        Someone asked to use this address for a VerseMate account. Confirm it to
        finish the change.
      </Text>
      <Section style={{ textAlign: "center", margin: "28px 0" }}>
        <Link style={button} href={href}>
          Confirm my new email
        </Link>
      </Section>
      <Text style={muted}>
        Or open this link: <Link href={href}>{href}</Link>
      </Text>
      <Text style={muted}>
        The link works once, for one hour. If you did not ask for this, ignore
        this email and nothing changes.
      </Text>
    </Layout>
  );
}

export function EmailChangeAccountExists() {
  return (
    <Layout
      preview="This address already has a VerseMate account"
      title="This address already has an account"
    >
      <Text style={text}>
        Someone asked to move a VerseMate account to this address. This address
        already has its own VerseMate account, so nothing was changed.
      </Text>
      <Text style={muted}>
        If it was you, sign in with this address instead, or reset its password
        if you do not remember it. If it was not you, ignore this email.
      </Text>
    </Layout>
  );
}

export function EmailChanged({ href }: { href?: string }) {
  return (
    <Layout
      preview="Your VerseMate email address was changed"
      title="Your email address was changed"
    >
      <Text style={text}>
        The email address on your VerseMate account was changed, and the account
        was signed out on every device.
      </Text>
      {href ? (
        <>
          <Text style={text}>
            If you did not make this change, undo it within 7 days. The account
            moves back to this address and every session is signed out.
          </Text>
          <Section style={{ textAlign: "center", margin: "28px 0" }}>
            <Link style={button} href={href}>
              Undo this change
            </Link>
          </Section>
          <Text style={muted}>
            After undoing it, set a new password with "Forgot password" before
            you sign in.
          </Text>
        </>
      ) : (
        <Text style={muted}>
          This address was never confirmed on the account, so the change cannot
          be undone from here.
        </Text>
      )}
    </Layout>
  );
}

export function EmailChangeUndone() {
  return (
    <Layout
      preview="An email address change on your VerseMate account was undone"
      title="The email address change was undone"
    >
      <Text style={text}>
        A recent change of the email address on a VerseMate account that used
        this address was undone from the previous address. The account no longer
        uses this address.
      </Text>
      <Text style={muted}>
        The account was signed out on every device and its password was removed.
        If you did not expect this, you can ignore this email.
      </Text>
    </Layout>
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
