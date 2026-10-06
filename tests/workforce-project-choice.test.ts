import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullDatabase } from "./helpers/full-database";
import { receiptReviewFixture } from "./helpers/receipt-review-fixture";
import { workforceProjectChoiceSchema,workforceProjectChoicesContextSchema } from "../src/lib/workforce-project-choice";
import { workforceScopeSchema } from "../src/lib/workforce";
import { emptyItem } from "../src/lib/estimates";

test("Current project selection follows direct-team scope and preserves administrative assignments and time",async t=>{
 const {db}=await fullDatabase("202610050080_field_time.sql");
 try {
  const f=await receiptReviewFixture(db);
  await f.as(f.owner);
  await db.query("select configure_workforce($1,$2,$3,1,'FOREMAN',null,true,'Synthetic direct supervisor')",[f.a,randomUUID(),f.office.id]);
  await db.query("select configure_workforce($1,$2,$3,1,'WORKER',$4,true,'Synthetic direct worker')",[f.a,randomUUID(),f.worker.id,f.office.id]);
  const entry=randomUUID();
  const times=(await db.query<{start:string;end:string}>("select (now()-interval '2 hours')::text start,(now()-interval '1 hour')::text end")).rows[0];
  const manual={worker_id:f.worker.id,project_id:f.project,starts_at:times.start,ends_at:times.end,break_minutes:15,status:"APROBADO",notes:"Synthetic full day",reason:"Synthetic administrative time"};
  await db.query("select save_time_entry($1,$2,0,$3)",[f.a,entry,JSON.stringify(manual)]);
  const preserved=async()=>{
   await db.exec("reset role");
   return (await db.query("select jsonb_build_object('assignments',(select jsonb_agg(to_jsonb(a) order by id) from workforce_assignments a),'profiles',(select jsonb_agg(to_jsonb(p) order by id) from workforce_profiles p),'entries',(select jsonb_agg(to_jsonb(e) order by id) from time_entries e),'expenses',(select jsonb_agg(to_jsonb(e) order by id) from expenses e),'members',(select jsonb_agg(to_jsonb(m) order by user_id) from memberships m)) data")).rows[0];
  };
  const baseline=await preserved();
  await db.exec(await readFile(new URL("../supabase/migrations/202610060081_workforce_project_choices.sql",import.meta.url),"utf8"));
  await t.test("additive schema preserves every baseline assignment, profile, time and financial row",async()=>assert.deepEqual(await preserved(),baseline));
  const ctx=async(user=f.office.user,company=f.a)=>{await f.as(user);return workforceProjectChoicesContextSchema.parse((await db.query<{data:unknown}>("select workforce_project_choices_context($1) data",[company])).rows[0].data);};
  const choice=async(version:number,project:string|null,request=randomUUID(),worker=f.worker.id,company=f.a)=> (await db.query<{data:{id:string;version:number;project_id:string|null}}>("select choose_workforce_project($1,$2,$3,$4,$5) data",[company,request,worker,version,project])).rows[0].data;
  let tx=false;
  const reject=async(run:()=>Promise<unknown>,match:RegExp)=>{await db.exec("savepoint denied");try{await assert.rejects(run,match);}finally{await db.exec("rollback to denied;release denied");}};
  const rollback=async(run:()=>Promise<void>)=>{await db.exec("reset role;begin");tx=true;try{await run();}finally{await db.exec("rollback;reset role");tx=false;}};
  await t.test("foreman context contains only direct workers and minimal same-company project labels",async()=>{
   const c=await ctx();assert.deepEqual(c.workers.map(w=>w.id),[f.worker.id]);assert.equal(c.workers[0].version,0);assert.equal(c.workers[0].project_id,null);assert.equal(c.projects.some(p=>p.id===f.foreignProject),false);
  });
  await t.test("WORKER, OFFICE and anonymous callers cannot use the team action",async()=>rollback(async()=>{
   await f.as(f.worker.user);await reject(()=>choice(0,f.project),/foreman_required/);await reject(()=>ctx(f.worker.user),/foreman_required/);
   await f.as(f.owner);await db.query("select configure_workforce($1,$2,$3,2,'OFFICE',null,true,'Synthetic office scope')",[f.a,randomUUID(),f.office.id]);
   await f.as(f.office.user);await reject(()=>choice(0,f.project),/foreman_required/);
   await f.as(f.worker.user,"anon");await reject(()=>choice(0,f.project),/permission denied/);
  }));
  await t.test("foreman cannot assign self, other tenant or nonexistent worker",async()=>rollback(async()=>{
   await f.as(f.office.user);
   for(const worker of [f.office.id,f.foreignWorker.id,randomUUID()]) await reject(()=>choice(0,f.project,randomUUID(),worker),/worker_outside_team/);
   await reject(()=>choice(0,f.foreignProject),/project_unavailable/);
   await reject(()=>choice(0,randomUUID()),/project_unavailable/);
   await reject(()=>choice(0,f.project,randomUUID(),f.worker.id,f.b),/permission_denied/);
  }));
  const request=randomUUID();let first:{id:string;version:number;project_id:string|null};
  await t.test("assign action appends one audited version without modifying clocks or pay",async()=>{
   await f.as(f.office.user);first=await choice(0,f.project,request);assert.equal(first.version,1);assert.equal(first.project_id,f.project);assert.deepEqual(await preserved(),baseline);
   const c=await ctx();assert.equal(c.workers[0].project_id,f.project);assert.equal(c.workers[0].version,1);
   await db.exec("reset role");assert.equal((await db.query<{n:number}>("select count(*)::int n from audit_events where entity='workforce_project_choices' and entity_id=$1",[first.id])).rows[0].n,1);
  });
  await t.test("lost response replays same result and a reused request with other data is rejected",async()=>rollback(async()=>{
   await f.as(f.office.user);assert.deepEqual(await choice(0,f.project,request),first!);await reject(()=>choice(0,null,request),/request_conflict/);
   await db.exec("reset role");assert.equal((await db.query<{n:number}>("select count(*)::int n from workforce_project_choices")).rows[0].n,1);
  }));
  await t.test("stale version rejects assignment and clear without appending history",async()=>rollback(async()=>{
   await f.as(f.office.user);await reject(()=>choice(0,f.project),/record_conflict/);await reject(()=>choice(0,null),/record_conflict/);
  }));
  await t.test("disabled worker and moved supervisor invalidate cached requests",async()=>rollback(async()=>{
   await f.as(f.owner);await db.query("select configure_workforce($1,$2,$3,2,'WORKER',null,true,'Synthetic reassignment')",[f.a,randomUUID(),f.worker.id]);
   await f.as(f.office.user);await reject(()=>choice(0,f.project,request),/worker_outside_team/);
   await db.exec("reset role");await db.query("update workers set active=false where company_id=$1 and id=$2",[f.a,f.worker.id]);
   await f.as(f.office.user);await reject(()=>choice(1,null),/worker_outside_team/);
  }));
  await t.test("profile or module revocation invalidates cached request authorization",async()=>rollback(async()=>{
   await f.as(f.owner);await db.query("select configure_workforce($1,$2,$3,2,'WORKER',null,true,'Synthetic profile revocation')",[f.a,randomUUID(),f.office.id]);
   await f.as(f.office.user);await reject(()=>choice(0,f.project,request),/foreman_required/);
   await f.as(f.owner);await db.query("select set_member_access($1,$2,'member',true,'{}')",[f.a,f.office.user]);
   await f.as(f.office.user);await reject(()=>choice(0,f.project,request),/permission_denied/);
  }));
  await t.test("read-only foreman can view context but cannot change a choice or replay a write",async()=>rollback(async()=>{
   await f.as(f.owner);await db.query("select set_member_access($1,$2,'member',true,$3)",[f.a,f.office.user,JSON.stringify({horasfix:["read"]})]);
   assert.equal((await ctx()).workers[0].id,f.worker.id);
   await reject(()=>choice(1,null),/permission_denied/);await reject(()=>choice(0,f.project,request),/permission_denied/);
  }));
  await t.test("disabled foreman loses the action and cached response",async()=>rollback(async()=>{
   await f.as(f.owner);await db.query("select configure_workforce($1,$2,$3,2,'FOREMAN',null,false,'Synthetic disabled foreman')",[f.a,randomUUID(),f.office.id]);
   await f.as(f.office.user);await reject(()=>choice(1,null),/foreman_required/);await reject(()=>choice(0,f.project,request),/foreman_required/);
  }));
  await t.test("null and negative versions and missing request reject atomically",async()=>rollback(async()=>{
   await f.as(f.office.user);await reject(()=>choice(-1,f.project),/invalid_project_choice/);
   await reject(()=>db.query("select choose_workforce_project($1,null,$2,1,$3)",[f.a,f.worker.id,f.project]),/invalid_project_choice/);
  }));
  await t.test("completed project is selectable like ADT but existing clock restrictions remain",async()=>rollback(async()=>{
   await db.exec("reset role");await db.query("update projects set status='COMPLETADO' where company_id=$1 and id=$2",[f.a,f.project]);
   await f.as(f.office.user);await choice(1,f.project);assert.equal((await ctx()).workers[0].project_id,f.project);
   await f.as(f.worker.user);const s=workforceScopeSchema.parse((await db.query<{data:unknown}>("select workforce_scope($1) data",[f.a])).rows[0].data);assert.equal(s.projects.some(p=>p.id===f.project),false);
  }));
  await t.test("clear action removes the preferred project and retains assignments and history",async()=>{
   await f.as(f.office.user);const c=await choice(1,null);assert.equal(c.version,2);assert.equal(c.project_id,null);assert.equal((await ctx()).workers[0].project_id,null);
   await f.as(f.worker.user);const s=workforceScopeSchema.parse((await db.query<{data:unknown}>("select workforce_scope($1) data",[f.a])).rows[0].data);assert.equal(s.preferred_project_id,null);assert.equal(s.projects.some(p=>p.id===f.project),true);assert.deepEqual(await preserved(),baseline);
  });
  await t.test("current choice enables a new project without rewriting administrative assignment history",async()=>rollback(async()=>{
   await f.as(f.owner);const estimate=randomUUID();
   const customer=(await db.query<{id:string}>("select customer_id id from projects where id=$1",[f.project])).rows[0].id;
   await db.query("select save_estimate($1,$2,0,$3)",[f.a,estimate,JSON.stringify({customer_id:customer,estimate_date:f.day,valid_until:null,status:"BORRADOR",notes:"",discount:"0",taxes:"0",items:[{...emptyItem,name:"QA assignment",unit_price:"100"}]})]);
   await db.query("select approve_estimate($1,$2,1,$3,'Synthetic second job','Synthetic assignment test')",[f.a,estimate,f.day]);
   const second=(await db.query<{id:string}>("select id from projects where estimate_id=$1",[estimate])).rows[0].id;
   await f.as(f.worker.user);assert.equal(workforceScopeSchema.parse((await db.query<{data:unknown}>("select workforce_scope($1) data",[f.a])).rows[0].data).projects.some(p=>p.id===second),false);
   await f.as(f.office.user);await choice(2,second);
   await f.as(f.worker.user);const s=workforceScopeSchema.parse((await db.query<{data:unknown}>("select workforce_scope($1) data",[f.a])).rows[0].data);assert.equal(s.preferred_project_id,second);assert.equal(s.projects.some(p=>p.id===second),true);
   await f.as(f.office.user);await choice(3,null);
   await f.as(f.worker.user);assert.equal(workforceScopeSchema.parse((await db.query<{data:unknown}>("select workforce_scope($1) data",[f.a])).rows[0].data).projects.some(p=>p.id===second),false);
   assert.deepEqual(await preserved(),baseline);
  }));
  await t.test("historical project scope keeps the assignment recorded at that moment",async()=>{
   await db.exec("reset role");const at=(await db.query<{at:string}>("select chosen_at::text at from workforce_project_choices where id=$1",[first!.id])).rows[0].at;
   assert.equal((await db.query<{p:string}>("select app_private.workforce_current_project($1,$2,$3) p",[f.a,f.worker.id,at])).rows[0].p,f.project);
   assert.equal((await db.query<{p:string|null}>("select app_private.workforce_current_project($1,$2,clock_timestamp()) p",[f.a,f.worker.id])).rows[0].p,null);
  });
  await t.test("direct table mutation and private helper access are denied",async()=>rollback(async()=>{
   await f.as(f.office.user);assert.equal((await db.query("select * from workforce_project_choices")).rows.length,0);
   await reject(()=>db.query("delete from workforce_project_choices"),/permission denied/);
   await reject(()=>db.query("update workforce_project_choices set project_id=null"),/permission denied/);
   await reject(()=>db.query("select * from app_private.workforce_project_choice_requests"),/permission denied/);
   await reject(()=>db.query("select app_private.workforce_current_project($1,$2,now())",[f.a,f.worker.id]),/permission denied/);
  }));
  await t.test("full-day administrative registration stays restricted to manager and computes net minutes",async()=>rollback(async()=>{
   await f.as(f.worker.user);await reject(()=>db.query("select save_time_entry($1,$2,0,$3)",[f.a,randomUUID(),JSON.stringify(manual)]),/permission_denied|manager_required/);
   await f.as(f.office.user);await reject(()=>db.query("select save_time_entry($1,$2,0,$3)",[f.a,randomUUID(),JSON.stringify(manual)]),/permission_denied|manager_required/);
   await db.exec("reset role");assert.equal((await db.query<{minutes:number}>("select minutes from time_entries where id=$1",[entry])).rows[0].minutes,45);
  }));
  assert.equal(tx,false);
 } finally {await db.close();}
});

test("project choice form accepts assign/clear and rejects invalid or stale-shaped fields",()=>{
 const base={request:randomUUID(),worker_id:randomUUID(),version:"0",project_id:randomUUID()};
 assert.equal(workforceProjectChoiceSchema.parse(base).version,0);
 assert.equal(workforceProjectChoiceSchema.parse({...base,project_id:""}).project_id,null);
 for(const fields of [{version:-1},{version:1.5},{request:""},{worker_id:"invalid"},{project_id:"invalid"}]) assert.equal(workforceProjectChoiceSchema.safeParse({...base,...fields}).success,false);
});
