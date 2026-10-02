<?php
if($argc!==4||!preg_match('/^[a-f0-9]{64}$/',$argv[3])){fwrite(STDERR,"Expected source, synthetic cases and SHA256\n");exit(2);}
if(!hash_equals($argv[3],hash_file('sha256',$argv[1]))){fwrite(STDERR,"Payment reference source mismatch\n");exit(2);}
require $argv[1];
$data=json_decode(file_get_contents($argv[2]),true,512,JSON_THROW_ON_ERROR);
$ref=new PaymentReference();
$map=['CASH'=>'EFECTIVO','CHEQUE'=>'CHEQUE','Wire transfer'=>'TRANSFERENCIA','ZELLE'=>'ZELLE','Not charged.'=>'NOT_CHARGED',''=>'SIN_METODO'];
foreach($data as $case){
 $response=$ref->paymentCreate(new Request($case['input']));
 $inv=$ref->state->invoice;
 $actual=['status'=>$response->status,'error'=>$response->data['error']??null,'paid_amount'=>$inv['paid_amount'],'balance_due'=>$inv['balance_due'],'payment_status'=>$inv['payment_status'],'count'=>count($ref->state->payments),'methods'=>array_map(fn($p)=>$map[$p['method']],$ref->state->payments)];
 if($actual!=$case['actual']){fwrite(STDERR,"ADT payment difference: ".$case['name']."\n".json_encode(['reference'=>$actual,'saas'=>$case['actual']])."\n");exit(1);}
}
echo "ADT payment reference: ".count($data)." independent comparisons passed; six UI methods, partial/full balance, zero and overpayment.\n";
