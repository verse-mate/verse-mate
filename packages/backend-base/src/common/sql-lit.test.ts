import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Glob } from "bun";
import ts from "typescript";

const SOURCE_ROOT = path.resolve(import.meta.dir, "..");

function isLiteral(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  );
}

function isSqlLitCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "lit" &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "sql"
  );
}

function nonLiteralSqlLitCalls(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];

  const visit = (node: ts.Node) => {
    if (isSqlLitCall(node) && !node.arguments.every(isLiteral)) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      found.push(
        `${path.relative(SOURCE_ROOT, file)}:${line + 1} ${node.getText()}`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}

describe("sql.lit usage", () => {
  it("only inlines literal values, never variables", () => {
    const files = [...new Glob("**/*.ts").scanSync(SOURCE_ROOT)]
      .filter((file) => !file.endsWith(".test.ts"))
      .map((file) => path.join(SOURCE_ROOT, file));

    const offenders = files.flatMap(nonLiteralSqlLitCalls);

    expect(files.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("detects a variable passed to sql.lit", () => {
    const probe = path.join(SOURCE_ROOT, "common", "sql-lit.test.ts");
    const source = ts.createSourceFile(
      probe,
      "const a = sql.lit(languageCode); const b = sql.lit('en');",
      ts.ScriptTarget.Latest,
      true,
    );
    const calls: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (isSqlLitCall(node)) calls.push(node);
      ts.forEachChild(node, visit);
    };
    visit(source);

    expect(calls.map((call) => call.arguments.every(isLiteral))).toEqual([
      false,
      true,
    ]);
  });
});
