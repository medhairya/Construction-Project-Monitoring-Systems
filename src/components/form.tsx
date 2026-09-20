"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Alert, Button } from "@/components/ui";
import type { ActionState } from "@/lib/actions";

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  disabled,
  title,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending || disabled} title={title}>
      {pending ? "Working…" : children}
    </Button>
  );
}

/**
 * Wraps a server action in useActionState and renders its error/ok message.
 * `children` receives nothing; the caller composes the fields.
 */
export function ActionForm({
  action,
  children,
  className,
  hideMessages,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  hideMessages?: boolean;
}) {
  const [state, formAction] = useActionState(action, {} as ActionState);
  return (
    <form action={formAction} className={className}>
      {!hideMessages && state.error ? (
        <div className="mb-3">
          <Alert tone="error">{state.error}</Alert>
        </div>
      ) : null}
      {!hideMessages && state.ok ? (
        <div className="mb-3">
          <Alert tone="success">{state.ok}</Alert>
        </div>
      ) : null}
      {children}
    </form>
  );
}
