"use client";

import { Field, Input } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { loginAction } from "@/lib/actions";

export function LoginForm() {
  return (
    <ActionForm action={loginAction}>
      <Field label="Email">
        <Input name="email" type="email" defaultValue="ministry@demo" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" defaultValue="Demo@1234" required />
      </Field>
      <SubmitButton>Sign in</SubmitButton>
    </ActionForm>
  );
}
