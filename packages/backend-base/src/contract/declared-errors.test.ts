import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

import { COACH_REFUSALS } from "../coach/coach.schema";
import { contractApp } from "./contract-app";

type Route = { method: string; path: string; hooks: { response?: object } };

const routes = contractApp().routes as unknown as Route[];

function declared(method: string, path: string): number[] {
  const route = routes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`no route ${method} ${path}`);
  return Object.keys(route.hooks.response ?? {}).map(Number);
}

function missing(method: string, path: string, statuses: Iterable<number>) {
  const have = declared(method, path);
  return [...new Set(statuses)]
    .filter((status) => !have.includes(status))
    .map((status) => `${method} ${path} ${status}`);
}

const ERROR_STATUS: Record<string, number> = {
  ValidationError: 400,
  UnauthorizedError: 401,
  ForbiddenError: 403,
  NotFoundError: 404,
  ConflictError: 409,
};

function source(file: string) {
  const path = join(import.meta.dir, "..", file);
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function learningServiceStatuses(): Map<string, Set<number>> {
  const sf = source("coach/coach-learning.service.ts");
  const own = new Map<string, Set<number>>();
  const calls = new Map<string, Set<string>>();
  const record = (name: string, body: ts.Node) => {
    const statuses = new Set<number>();
    const called = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee) && callee.text === "refuse") {
          const status = node.arguments[2];
          statuses.add(
            status && ts.isNumericLiteral(status) ? Number(status.text) : 409,
          );
        } else if (ts.isIdentifier(callee)) called.add(callee.text);
        else if (
          ts.isPropertyAccessExpression(callee) &&
          callee.expression.kind === ts.SyntaxKind.ThisKeyword
        )
          called.add(callee.name.text);
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
        const status = ERROR_STATUS[node.expression.text];
        if (status) statuses.add(status);
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    own.set(name, statuses);
    calls.set(name, called);
  };
  const walk = (node: ts.Node) => {
    if (
      (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) &&
      node.name &&
      node.body
    )
      record(node.name.getText(sf), node.body);
    else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isArrowFunction(node.initializer)
    )
      record(node.name.text, node.initializer.body);
    ts.forEachChild(node, walk);
  };
  walk(sf);
  const total = new Map<string, Set<number>>();
  const resolve = (name: string, seen = new Set<string>()): Set<number> => {
    if (total.has(name)) return total.get(name) as Set<number>;
    const out = new Set(own.get(name) ?? []);
    seen.add(name);
    for (const next of calls.get(name) ?? [])
      if (!seen.has(next)) for (const s of resolve(next, seen)) out.add(s);
    total.set(name, out);
    return out;
  };
  for (const name of own.keys()) resolve(name);
  return total;
}

function pluginRoutes(file: string) {
  const sf = source(file);
  const found: Array<{
    method: string;
    path: string;
    methods: string[];
    thrown: number[];
  }> = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["get", "post", "put", "patch", "delete"].includes(
        node.expression.name.text,
      ) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments.length >= 2
    ) {
      const handler = node.arguments[1].getText(sf);
      found.push({
        method: node.expression.name.text.toUpperCase(),
        path: `/coach${node.arguments[0].text}`,
        methods: [...handler.matchAll(/learningService\.(\w+)\(/g)].map(
          (m) => m[1],
        ),
        thrown: [...handler.matchAll(/new (\w+Error)\(/g)]
          .map((m) => ERROR_STATUS[m[1]])
          .filter((status): status is number => status !== undefined),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("every refusal a route can answer is declared on it", () => {
  it("the coach refusal table", () => {
    const gaps = Object.entries(COACH_REFUSALS).flatMap(([key, refusals]) => {
      const [method, path] = key.split(" ");
      return missing(
        method,
        path,
        Object.values(refusals as Record<string, { status: number }>).map(
          (r) => r.status,
        ),
      );
    });
    expect(gaps).toEqual([]);
  });

  it("the learning service's refusals, and the sign-in and admin checks in front of them", () => {
    const statuses = learningServiceStatuses();
    const found = pluginRoutes("coach/coach-learning.plugin.ts");
    expect(found.length).toBeGreaterThan(30);
    const gaps = found.flatMap(({ method, path, methods }) =>
      missing(method, path, [
        401,
        ...(path.startsWith("/coach/admin/") ? [403] : []),
        ...methods.flatMap((name) => [...(statuses.get(name) ?? [])]),
      ]),
    );
    expect(gaps).toEqual([]);
  });

  it("the errors each coach handler throws itself", () => {
    const found = pluginRoutes("coach/coach.plugin.ts");
    expect(found.length).toBeGreaterThan(80);
    const gaps = found.flatMap(({ method, path, thrown }) =>
      missing(
        method,
        path,
        thrown.filter((status) => status !== 400),
      ),
    );
    expect(gaps).toEqual([]);
  });
});
