const LOCAL = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]+(?<!\.)$/;
const DOMAIN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isEmailAddress(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.lastIndexOf("@");
  if (at <= 0) return false;
  return LOCAL.test(value.slice(0, at)) && DOMAIN.test(value.slice(at + 1));
}

export function isSingleRecipient(value: string): boolean {
  return /^[^\s,;<>"@()\\:[\]\p{Cc}]+@[^\s,;<>"@()\\:[\]\p{Cc}]+$/u.test(value);
}
