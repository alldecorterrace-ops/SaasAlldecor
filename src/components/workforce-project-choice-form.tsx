"use client";
import { chooseProject, type ProjectChoiceState } from "@/app/app/[companyId]/horas/equipo/actions";
import { usePreservedActionState } from "./use-preserved-action-state";
import { Feedback } from "./feedback";
import { SubmitButton } from "./submit-button";
export function WorkforceProjectChoiceForm({companyId,request,worker,projects}:{companyId:string;request:string;worker:{id:string;name:string;project_id:string|null;version:number};projects:{id:string;name:string}[]}) {
 const [state,action,pending,onReset]=usePreservedActionState(chooseProject.bind(null,companyId),{} as ProjectChoiceState);
 return <form action={action} onReset={onReset} className="space-y-3 mt-3">
  <Feedback error={state.error}/>
  <input type="hidden" name="request" value={request}/><input type="hidden" name="worker_id" value={worker.id}/><input type="hidden" name="version" value={worker.version}/>
  <fieldset disabled={pending}>
   <label className="field">Obra actual de {worker.name}<select name="project_id" defaultValue={worker.project_id??""}>
    <option value="">Sin obra actual</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
   </select></label>
  </fieldset><SubmitButton>Guardar obra actual</SubmitButton>
 </form>;
}
