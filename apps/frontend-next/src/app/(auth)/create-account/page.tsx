"use client";
import { AuthWrapperPage, SignUp } from "frontend-base";

export const runtime = "edge";

export default function CreateAccount() {
  return (
    <AuthWrapperPage>
      <SignUp />
    </AuthWrapperPage>
  );
}
