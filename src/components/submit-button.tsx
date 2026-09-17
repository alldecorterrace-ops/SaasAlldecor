"use client";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
export function SubmitButton({
  children,
  pending = "Guardando…",
}: {
  children: React.ReactNode;
  pending?: string;
}) {
  const state = useFormStatus();
  return (
    <Button type="submit" disabled={state.pending}>
      {state.pending && <LoaderCircle className="size-4 animate-spin" />}
      {state.pending ? pending : children}
    </Button>
  );
}
