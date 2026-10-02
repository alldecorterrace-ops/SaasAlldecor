import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { emptyItem } from "../src/lib/estimates";
async function main() {
  const url=new URL(process.env.QUEUE_TEST_DATABASE_URL ?? "");
  if (!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname!=="/saas_queue_test") throw new Error("Dedicated local test database required");
  const pool=new Pool({connectionString:url.href,max:10,statement_timeout:30000});
  const owner=randomUUID(),company=randomUUID(),customer=randomUUID(),estimate=randomUUID();
  const actor=async <T>(fn:(c:PoolClient)=>Promise<T>)=>{
    const c=await pool.connect();try {await c.query("begin");await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await c.query("set local role authenticated");const result=await fn(c);await c.query("commit");return result;}catch(e){await c.query("rollback");throw e;}finally{c.release();}
  };
  const execute=(operation:string,id:string,version:number,data:object,request:string)=>actor(async c=>(await c.query("select execute_finance_action($1,$2,$3,$4,$5,$6) data",[company,request,operation,id,version,JSON.stringify(data)])).rows[0].data);
  try {
    await pool.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[owner,`${owner}@example.test`]);
    await actor(async c=>{
      await c.query("select create_company($1,'Finance request concurrency')",[company]);
      await c.query("select save_customer($1,$2,0,$3)",[company,customer,JSON.stringify({full_name:"Synthetic",status:"active"})]);
      await c.query("select save_estimate($1,$2,0,$3)",[company,estimate,JSON.stringify({customer_id:customer,estimate_date:"2026-10-01",valid_until:null,status:"PENDIENTE",notes:"",discount:"0",taxes:"0",items:[{...emptyItem,name:"QA",unit_price:"100.00"}]})]);
    });
    const request=randomUUID(),approval={date:"2026-10-01",name:"Synthetic project",note:"Synthetic approval"};
    const results=await Promise.all(Array.from({length:8},()=>execute("approve",estimate,1,approval,request)));
    assert(results.every(x=>JSON.stringify(x)===JSON.stringify(results[0])));
    const invoice=results[0].id;
    const payment=randomUUID(),payRequest=randomUUID(),data={payment_id:payment,amount:"25.10",payment_date:"2026-10-01",method:"ZELLE",reference:"QA",notes:""};
    const paid=await Promise.all(Array.from({length:8},()=>execute("payment",invoice,1,data,payRequest)));
    assert(paid.every(x=>JSON.stringify(x)===JSON.stringify(paid[0])));
    const race=await Promise.allSettled([execute("invoice",invoice,2,{date:"2026-10-01",due:null,notes:"First writer"},randomUUID()),execute("invoice",invoice,2,{date:"2026-10-01",due:null,notes:"Second writer"},randomUUID())]);
    assert.equal(race.filter(x=>x.status==="fulfilled").length,1);assert.equal(race.filter(x=>x.status==="rejected").length,1);
    const row=(await pool.query("select (select count(*)::int from invoices where company_id=$1) invoices,(select count(*)::int from projects where company_id=$1) projects,(select count(*)::int from payments where company_id=$1) payments,(select count(*)::int from app_private.finance_requests where company_id=$1) receipts,paid_amount,balance_due,version from invoices where company_id=$1",[company])).rows[0];
    assert.deepEqual(row,{invoices:1,projects:1,payments:1,receipts:3,paid_amount:"25.10",balance_due:"74.90",version:3});
    assert.equal((await pool.query("select method from payments where id=$1",[payment])).rows[0].method,"ZELLE");
    const before=(await pool.query("select count(*)::int n from audit_events where company_id=$1",[company])).rows[0].n;
    await assert.rejects(execute("payment",invoice,1,{...data,amount:"25.11"},payRequest),/request_conflict/);
    assert.equal((await pool.query("select count(*)::int n from audit_events where company_id=$1",[company])).rows[0].n,before);
    console.log("Finance concurrency: eight approval retries, eight payment retries, one stale writer rejected; Zelle method, cents and receipts preserved.");
  } finally {await pool.end();}
}
main().catch(()=>{console.error("Finance concurrency verification failed");process.exitCode=1;});
