const DATED_SNAPSHOT = /^-\d{4}-\d{2}-\d{2}$/;

export function isModel(id: string, known: string): boolean {
  const model = id.trim().toLowerCase();
  return (
    model === known ||
    (model.startsWith(known) && DATED_SNAPSHOT.test(model.slice(known.length)))
  );
}

const RETIRED_MODELS: Record<string, string> = {
  "gpt-5": "gpt-6.1-sol",
  "gpt-5-mini": "gpt-6.1-terra",
  "gpt-5-nano": "gpt-6-luna",
};

export function currentModel(model: string): string {
  const retired = Object.keys(RETIRED_MODELS).find((id) => isModel(model, id));
  return retired ? RETIRED_MODELS[retired] : model;
}

export function replaceRetiredModel({ body }: { body: unknown }): void {
  if (
    body &&
    typeof body === "object" &&
    "model" in body &&
    typeof body.model === "string"
  )
    body.model = currentModel(body.model);
}
