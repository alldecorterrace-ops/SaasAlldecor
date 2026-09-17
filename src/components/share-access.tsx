"use client";
import { useEffect, useRef } from "react";
import { ActionForm } from "./action-form";
import { accessShare } from "@/app/acceso/actions";
export function ShareAccess() {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(fragment)) {
      if (input.current) input.current.value = fragment;
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);
  return (
    <ActionForm action={accessShare} label="Abrir acceso privado">
      <label className="field">
        Código de acceso
        <input
          autoComplete="off"
          type="password"
          name="token"
          ref={input}
          required
          maxLength={64}
        />
      </label>
      <p className="text-sm">
        El código se completa al abrir el enlace de tu empresa.
      </p>
    </ActionForm>
  );
}
