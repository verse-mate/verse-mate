import { createHash } from "node:crypto";

const STYLE = `body{margin:0;background:#f6f6f4;font-family:Arial,sans-serif;color:#334155}
main{max-width:480px;margin:48px auto;padding:24px;background:#fff;border-radius:12px}
h1{font-size:22px;color:#0f172a;margin:0 0 12px}
p{font-size:15px;line-height:1.6}
label{display:block;font-size:15px;margin:16px 0 6px}
input[type=email]{box-sizing:border-box;width:100%;padding:10px;font-size:15px;border:1px solid #cbd5e1;border-radius:8px}
button{margin-top:20px;padding:12px 20px;font-size:15px;font-weight:600;color:#fff;background:#0284c7;border:0;border-radius:8px;cursor:pointer}`;

const STYLE_HASH = createHash("sha256").update(STYLE).digest("base64");

const POLICY = [
  "default-src 'none'",
  `style-src 'sha256-${STYLE_HASH}'`,
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body><main><h1>${title}</h1>${body}</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": POLICY,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

export function confirmEmailChangeForm(key: string, wrongAddress = false) {
  return page(
    wrongAddress ? 400 : 200,
    "Confirm your new email address",
    `${
      wrongAddress
        ? "<p>That is not the account's current email address. Try again.</p>"
        : "<p>To finish moving your VerseMate account to this address, enter the email address the account uses now.</p>"
    }<form method="post" action="confirm-email-change">
<input type="hidden" name="key" value="${escapeHtml(key)}">
<label for="email">Current email address</label>
<input type="email" id="email" name="email" required autocomplete="email">
<button type="submit">Confirm my new email</button>
</form>`,
  );
}

export function emailChangeLinkUnusable() {
  return page(
    404,
    "This link cannot be used",
    "<p>The link has expired, was already used, or was replaced by a newer request. Change your email again in VerseMate to get a new link.</p>",
  );
}

export function emailChangeConfirmed() {
  return page(
    200,
    "Your email address was changed",
    "<p>Your VerseMate account now uses this address. You were signed out everywhere, so sign in again with your new address.</p>",
  );
}

export function revertEmailChangeForm(key: string) {
  return page(
    200,
    "Undo the email change",
    `<p>This moves your VerseMate account back to this email address, removes its password and signs it out everywhere. Afterwards, set a new password with "Forgot password".</p><form method="post" action="revert-email-change">
<input type="hidden" name="key" value="${escapeHtml(key)}">
<button type="submit">Undo the change</button>
</form>`,
  );
}

export function emailChangeReverted() {
  return page(
    200,
    "The change was undone",
    '<p>Your VerseMate account uses this email address again and was signed out everywhere. Set a new password with "Forgot password" in VerseMate to sign in.</p>',
  );
}
