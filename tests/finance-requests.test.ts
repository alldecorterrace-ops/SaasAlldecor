import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fullDatabase } from "./helpers/full-database";
import { emptyItem } from "../src/lib/estimates";
import { parseFinanceRequest } from "../src/lib/finance-requests";

test("finance form creates a typed request and preserves exact amounts", () => {
  const form = new FormData();
  const id = randomUUID(), request = randomUUID(), payment = randomUUID();
  for (const [key,value] of Object.entries({ operation:"payment", id, request, version:"2", payment_id:payment, amount:"25.10", payment_date:"2026-10-01", method:"TRANSFERENCIA", reference:"QA", notes:"", unexpected:"ignored" })) form.set(key,value);
  const parsed = parseFinanceRequest(form);
  assert(parsed.success);
  assert.deepEqual(parsed.data, { operation:"payment", id, request, version:2, payload:{ payment_id:payment, amount:"25.10", payment_date:"2026-10-01", method:"TRANSFERENCIA", reference:"QA", notes:"" }});
  for (const [key,value] of [["request",""],["version","0"],["amount","25.101"],["operation","arbitrary-rpc"]]) {
    const copy = new FormData(); for (const [k,v] of form) copy.set(k,v); copy.set(key,value);
    assert.equal(parseFinanceRequest(copy).success,false);
  }
});

test("durable finance receipts recover lost responses without repeating effects", async (t) => {
  const {db}=await fullDatabase();
  const owner=randomUUID(), staff=randomUUID(), a=randomUUID(), b=randomUUID(), customer=randomUUID(), estimate=randomUUID();
  const as=async (id:string, role="authenticated")=>{
    await db.exec("reset role"); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec(`set role ${role}`);
  };
  const execute=async (operation:string,id:string,version:number,data:object,request=randomUUID(),company=a)=>
    (await db.query<{data:{id:string;version:number;operation:string}}>("select execute_finance_action($1,$2,$3,$4,$5,$6) data",[company,request,operation,id,version,JSON.stringify(data)])).rows[0].data;
  const snapshot=async()=>{
    await db.exec("reset role");
    const rows=(await db.query("select (select count(*) from app_private.finance_requests)::int receipts,(select count(*) from audit_events)::int audits,(select jsonb_agg(to_jsonb(i) order by id) from invoices i) invoices,(select jsonb_agg(to_jsonb(p) order by id) from payments p) payments,(select jsonb_agg(to_jsonb(p) order by id) from projects p) projects")).rows;
    await as(owner);return rows;
  };
  try {
    await db.query("insert into auth.users values($1,'owner@example.test',now()),($2,'staff@example.test',now())",[owner,staff]);
    await as(owner);
    await db.query("select create_company($1,'Finance A'),create_company($2,'Finance B')",[a,b]);
    await db.query("select save_customer($1,$2,0,$3)",[a,customer,JSON.stringify({full_name:"Synthetic customer",status:"active"})]);
    await db.query("select save_estimate($1,$2,0,$3)",[a,estimate,JSON.stringify({customer_id:customer,estimate_date:"2026-10-01",valid_until:null,status:"PENDIENTE",notes:"",discount:"0",taxes:"0",items:[{...emptyItem,name:"QA",unit_price:"100.00"}]})]);
    await db.query("select add_company_member($1,'staff@example.test')",[a]);
    const approval={date:"2026-10-01",name:"Synthetic project",note:"Synthetic approval"}, request=randomUUID();
    const receipt=await execute("approve",estimate,1,approval,request);
    const invoice=receipt.id;
    const project=(await db.query<{id:string}>("select id from projects where company_id=$1",[a])).rows[0].id;
    await t.test("approval retry returns original receipt, one invoice/project and unchanged audit",async()=>{
      const before=await snapshot();
      assert.deepEqual(await execute("approve",estimate,1,approval,request),receipt);
      await assert.rejects(execute("approve",estimate,1,{...approval,note:"Changed intent"},request),/request_conflict/);
      assert.deepEqual(await snapshot(),before);
      assert.equal((await db.query("select id from invoices")).rows.length,1);
      assert.equal((await db.query("select id from projects")).rows.length,1);
    });
    await t.test("gate failure leaves neither an effect nor a successful receipt",async()=>{
      const before=await snapshot();
      await assert.rejects(execute("project",project,1,{name:"Synthetic project",status:"PRODUCCION",start_date:null,end_date:null,notes:""}),/deposit_required/);
      assert.deepEqual(await snapshot(),before);
    });
    const payment=randomUUID(), payRequest=randomUUID(), payData={payment_id:payment,amount:"25.10",payment_date:"2026-10-01",method:"TRANSFERENCIA",reference:"QA-REQUEST",notes:"Synthetic"};
    const payReceipt=await execute("payment",invoice,1,payData,payRequest);
    await t.test("payment retries preserve cents and do not increase invoice version",async()=>{
      const before=await snapshot();
      assert.deepEqual(await execute("payment",invoice,1,payData,payRequest),payReceipt);
      await assert.rejects(execute("payment",invoice,1,{...payData,amount:"25.11"},payRequest),/request_conflict/);
      await assert.rejects(execute("payment",invoice,2,{...payData,payment_id:randomUUID(),reference:"QA-OVER",amount:"75.00"}),/overpayment/);
      assert.deepEqual(await snapshot(),before);
      const i=(await db.query<{paid_amount:string;balance_due:string;version:number}>("select paid_amount,balance_due,version from invoices where id=$1",[invoice])).rows[0];
      assert.deepEqual(i,{paid_amount:"25.10",balance_due:"74.90",version:2});
      assert.deepEqual(await execute("approve",estimate,1,approval,request),receipt);
    });
    await t.test("project and invoice changes are recovered, stale new requests conflict",async()=>{
      const data={name:"Synthetic project",status:"PRODUCCION",start_date:"2026-10-01",end_date:null,notes:"Synthetic"},req=randomUUID();
      const result=await execute("project",project,1,data,req);
      const before=await snapshot();
      assert.deepEqual(await execute("project",project,1,data,req),result);
      await assert.rejects(execute("project",project,1,data),/record_conflict/);
      assert.deepEqual(await snapshot(),before);
      const invData={date:"2026-10-01",due:"2026-10-10",notes:"Synthetic edit"},invReq=randomUUID();
      const invResult=await execute("invoice",invoice,2,invData,invReq),after=await snapshot();
      assert.deepEqual(await execute("invoice",invoice,2,invData,invReq),invResult);
      await assert.rejects(execute("invoice",invoice,2,invData),/record_conflict/);
      assert.deepEqual(await snapshot(),after);
    });
    await t.test("reversal and void keep financial records and have exactly one effect",async()=>{
      const req=randomUUID(),result=await execute("void-payment",payment,1,{reason:"Synthetic reversal"},req),before=await snapshot();
      assert.deepEqual(await execute("void-payment",payment,1,{reason:"Synthetic reversal"},req),result);
      await assert.rejects(execute("void-payment",payment,1,{reason:"Changed reversal"},req),/request_conflict/);
      assert.deepEqual(await snapshot(),before);
      const inv=(await db.query<{version:number;balance_due:string}>("select version,balance_due from invoices where id=$1",[invoice])).rows[0];
      assert.equal(inv.balance_due,"100.00");
      const data={date:"2026-10-01",due:null,notes:"Synthetic edit",reason:"Synthetic void"},voidReq=randomUUID();
      const voidResult=await execute("void-invoice",invoice,inv.version,data,voidReq),after=await snapshot();
      assert.deepEqual(await execute("void-invoice",invoice,inv.version,data,voidReq),voidResult);
      assert.deepEqual(await snapshot(),after);
      assert.equal((await db.query("select id from payments where status='VOID'")).rows.length,1);
    });
    await t.test("retries recheck permissions, receipts stay private and tenants remain isolated",async()=>{
      await db.query("select set_member_access($1,$2,'member',true,$3)",[a,staff,JSON.stringify({"fin-estimados":["write"],"fin-invoices":["write"],"fin-proyectos":["write"]})]);
      await as(staff);
      const staffRequest=randomUUID();
      await execute("approve",estimate,1,approval,staffRequest);
      await assert.rejects(db.query("select * from app_private.finance_requests"),/permission denied/);
      await as(owner);
      await db.query("select set_member_access($1,$2,'member',true,'{}')",[a,staff]);
      await as(staff);
      await assert.rejects(execute("approve",estimate,1,approval,staffRequest),/permission_denied/);
      await as(owner);
      const before=await snapshot();
      await assert.rejects(execute("approve",estimate,1,approval,randomUUID(),b),/estimate_unavailable/);
      await assert.rejects(execute("untrusted",invoice,1,{}),/invalid_finance_request/);
      assert.deepEqual(await snapshot(),before);
      await as("","anon");
      await assert.rejects(execute("approve",estimate,1,approval,request),/permission denied/);
    });
  } finally {await db.close();}
});
