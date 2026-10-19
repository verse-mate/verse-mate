import { useState } from "react";
import { NOTETAKER_INVITE_ADDRESS } from "@/lib/notetaker";

/** The recorder's invite address with a copy button; `onDark` for the dark hero. */
export default function InviteAddress({ onDark = false }: { onDark?: boolean }) {
  const [copied, setCopied] = useState(false);
  // On a narrow screen the address breaks after "@", not mid-word.
  const [local, domain] = NOTETAKER_INVITE_ADDRESS.split("@");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(NOTETAKER_INVITE_ADDRESS);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context, denied): the address stays selectable.
    }
  };

  return (
    <div className={onDark ? "nt-address nt-address-dark" : "nt-address"}>
      <code>
        {local}@<wbr />
        {domain}
      </code>
      <button type="button" className={onDark ? "btn btn-ghost nt-copy" : "btn btn-ghost-dark nt-copy"} onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
