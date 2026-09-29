"use client";
import { Button } from "./ui/button";
import { useActionState } from "react";
import {
  generatePdf,
  type CommercialState,
} from "@/app/app/[companyId]/documentos/actions";
export function CommercialDocumentForm({
  companyId,
  kind,
  record,
  version,
}: {
  companyId: string;
  kind: "estimate" | "invoice";
  record: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(
    generatePdf.bind(null, companyId),
    {} as CommercialState,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="record" value={record} />
      <input type="hidden" name="version" value={version} />
      <Button disabled={pending}>
        {pending ? "Generando PDF…" : "Generar y conservar PDF"}
      </Button>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {state.documentId && (
        <p role="status">
          PDF conservado.{" "}
          <a
            className="underline"
            href={`/api/commercial-documents/${companyId}/${state.documentId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir PDF
          </a>
        </p>
      )}
    </form>
  );
}
