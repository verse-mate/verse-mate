"use client";
import { AuthWrapperPage, SignIn } from "frontend-base";

export const runtime = "edge";

export default function Login() {
  return (
    <AuthWrapperPage>
      <SignIn />
    </AuthWrapperPage>
  );
}
