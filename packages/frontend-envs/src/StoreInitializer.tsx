"use client";

import { useRef } from "react";
import { $env, type Env } from "./env";

export function StoreInitializer(env: Env) {
  const initialized = useRef(false);

  if (!initialized.current) {
    $env.set(env);

    initialized.current = true;
  }

  return null;
}
