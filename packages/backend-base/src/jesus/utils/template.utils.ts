/**
 * Placeholder substitution for prompt templates.
 *
 * `String.prototype.replace` with a string pattern replaces only the FIRST
 * occurrence, so a template that mentions `{category_label}` twice was rendered
 * with the second one left as literal `{category_label}` — and a prompt with a
 * visible placeholder in it still gets an answer from the model, so the failure
 * is silent and the output is subtly wrong.
 *
 * It also treats `$&`, `$'` and `` $` `` in the *replacement* as substitution
 * patterns. Scripture text and generated titles are not audited for dollar
 * signs, and they should never have to be. Using a function replacement opts
 * out of that interpretation entirely.
 */

/**
 * Fill `{placeholder}` slots in a template.
 *
 * Unknown placeholders are left alone rather than blanked: a typo in a template
 * should be visible when the prompt is printed, not quietly turn into an empty
 * string that reads as though the data were missing.
 */
export function fillTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key: string) =>
    Object.hasOwn(values, key) ? values[key] : match,
  );
}
