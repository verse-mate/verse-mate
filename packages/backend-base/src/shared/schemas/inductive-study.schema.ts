import {
  Kind,
  OptionalKind,
  type TArray,
  type TObject,
  type TSchema,
  type TUnion,
} from "@sinclair/typebox";
import { type Static, t } from "elysia";

const open = { additionalProperties: true } as const;

const stepBase = {
  number: t.Number(),
  title: t.String(),
  summary: t.String(),
};

const StepProse = t.Object(
  {
    ...stepBase,
    kind: t.Literal("prose"),
    body: t.String(),
  },
  open,
);

const StepQA = t.Object(
  {
    ...stepBase,
    kind: t.Literal("qa"),
    items: t.Array(
      t.Object(
        { tag: t.Optional(t.String()), q: t.String(), a: t.String() },
        open,
      ),
    ),
  },
  open,
);

const StepKeywords = t.Object(
  {
    ...stepBase,
    kind: t.Literal("keywords"),
    inventory: t.Array(
      t.Object(
        {
          word: t.String(),
          greek: t.Optional(t.String()),
          count: t.Number(),
          verses: t.String(),
          definition: t.Optional(t.String()),
        },
        open,
      ),
    ),
  },
  open,
);

const StepLists = t.Object(
  {
    ...stepBase,
    kind: t.Literal("lists"),
    lists: t.Array(
      t.Object(
        {
          title: t.String(),
          columns: t.Array(t.String()),
          rows: t.Array(t.Object({ ref: t.String(), truth: t.String() }, open)),
        },
        open,
      ),
    ),
  },
  open,
);

const StepContrasts = t.Object(
  {
    ...stepBase,
    kind: t.Literal("contrasts"),
    items: t.Array(
      t.Object(
        { verses: t.String(), type: t.String(), pairing: t.String() },
        open,
      ),
    ),
  },
  open,
);

const StepBullets = t.Object(
  {
    ...stepBase,
    kind: t.Literal("bullets"),
    intro: t.Optional(t.String()),
    items: t.Array(
      t.Object({ tag: t.Optional(t.String()), text: t.String() }, open),
    ),
    note: t.Optional(t.String()),
  },
  open,
);

const StepSegments = t.Object(
  {
    ...stepBase,
    kind: t.Literal("segments"),
    themeHeadline: t.String(),
    segments: t.Array(t.Object({ title: t.String(), body: t.String() }, open)),
  },
  open,
);

const StepOfAnotherKind = t.Object({ ...stepBase, kind: t.String() }, open);

export const InductiveStudySchema = t.Object(
  {
    bookId: t.Number(),
    bookName: t.String(),
    chapter: t.Number(),
    title: t.String(),
    subtitle: t.String(),
    themeOneLine: t.String(),
    steps: t.Array(
      t.Union([
        StepProse,
        StepQA,
        StepKeywords,
        StepLists,
        StepContrasts,
        StepBullets,
        StepSegments,
      ]),
    ),
    interpretation: t.Object(
      {
        intro: t.Optional(t.String()),
        movements: t.Array(
          t.Object(
            {
              number: t.Number(),
              title: t.String(),
              range: t.String(),
              excerpt: t.Optional(t.String()),
              body: t.String(),
            },
            open,
          ),
        ),
      },
      open,
    ),
    application: t.Object(
      {
        intro: t.Optional(t.String()),
        questions: t.Array(
          t.Object({ range: t.String(), question: t.String() }, open),
        ),
      },
      open,
    ),
  },
  open,
);

export type InductiveStudy = Static<typeof InductiveStudySchema>;

function required(schema: TSchema): TSchema {
  const { [OptionalKind]: _optional, ...rest } = schema;
  return rest as TSchema;
}

function asStored(schema: TSchema): TSchema {
  switch (schema[Kind]) {
    case "Object": {
      const { properties } = schema as TObject;
      return t.Object(
        Object.fromEntries(
          Object.entries(properties).map(([key, property]) => [
            key,
            t.Optional(t.Union([asStored(required(property)), t.Null()])),
          ]),
        ),
        open,
      );
    }
    case "Array":
      return t.Array(t.Union([asStored((schema as TArray).items), t.String()]));
    case "Union":
      return t.Union((schema as TUnion).anyOf.map(asStored));
    default:
      return required(schema);
  }
}

export const StoredStudySchema: TSchema = asStored(
  t.Object({
    ...InductiveStudySchema.properties,
    chapter: t.Union([t.Number(), t.String()]),
    steps: t.Array(
      t.Union([
        ...InductiveStudySchema.properties.steps.items.anyOf,
        StepOfAnotherKind,
      ]),
    ),
  }),
);
