"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/auth";
import { workforceProjectChoiceSchema, projectChoiceError } from "@/lib/workforce-project-choice";
export type ProjectChoiceState = {error?: string};
export async function chooseProject(companyId: string, _: ProjectChoiceState, form: FormData): Promise<ProjectChoiceState> {
  const {db} = await requireModule(companyId,"horasfix","write");
  const parsed = workforceProjectChoiceSchema.safeParse(Object.fromEntries(["request","worker_id","version","project_id"].map(k=>[k,String(form.get(k)??"")])));
  if (!parsed.success) return {error:parsed.error.issues[0].message};
  const choice=parsed.data;
  const {error}=await db.rpc("choose_workforce_project",{p_company:companyId,p_request:choice.request,p_worker:choice.worker_id,p_version:choice.version,p_project:choice.project_id});
  if(error) return {error:projectChoiceError(error)};
  revalidatePath(`/app/${companyId}`,"layout");
  redirect(`/app/${companyId}/horas/equipo?updated=project`);
}
