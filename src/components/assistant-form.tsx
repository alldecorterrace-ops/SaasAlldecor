"use client";
import { useActionState } from "react";
import {
  askAssistant,
  type AssistantReply,
} from "@/app/app/[companyId]/ia/actions";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function AssistantForm({
  companyId,
  requestId,
  disabled,
}: {
  companyId: string;
  requestId: string;
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    askAssistant.bind(null, companyId),
    {} as AssistantReply,
  );
  return (
    <div className="space-y-5">
      <form action={action} className="card space-y-4">
        <Feedback error={state.error} />
        <input name="request_id" type="hidden" value={requestId} />
        <fieldset disabled={disabled || pending || !!state.answer}>
          <label className="field">
            Tu consulta
            <textarea
              name="question"
              required
              minLength={3}
              maxLength={2000}
              rows={4}
              placeholder="¿Cuántas facturas están pendientes y qué debo revisar?"
            />
          </label>
          <SubmitButton>Consultar</SubmitButton>
        </fieldset>
      </form>
      {state.answer && (
        <section className="card space-y-4">
          <h2 className="font-semibold">{state.question}</h2>
          <p className="whitespace-pre-wrap">{state.answer}</p>
          <details>
            <summary>Datos consultados para esta respuesta</summary>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(state.context, null, 2)}
            </pre>
          </details>
          <a className="underline" href={`/app/${companyId}/ia`}>
            Nueva consulta
          </a>
        </section>
      )}
    </div>
  );
}
