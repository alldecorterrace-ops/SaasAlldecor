<?php
// Frozen ADT calculation, isolated from Drupal/database/HTTP. Synthetic cases only.
if ($argc !== 4 || !preg_match('/^[a-f0-9]{64}$/', $argv[3])) { fwrite(STDERR,"Expected source, cases and SHA256\n"); exit(2); }
if (!hash_equals($argv[3],hash_file('sha256',$argv[1]))) { fwrite(STDERR,"Reference source mismatch\n"); exit(2); }
require $argv[1];
$cases=json_decode(file_get_contents($argv[2]),true,512,JSON_THROW_ON_ERROR);
$map=['ia_estado'=>'state','ia_nota'=>'note','ia_comercio'=>'merchant','ia_direccion_comercio'=>'merchant_address','ia_fecha'=>'date','ia_monto'=>'total','ia_subtotal'=>'subtotal','ia_impuesto'=>'tax','ia_moneda'=>'currency','ia_factura_numero'=>'invoice','ia_tarjeta_ult4'=>'card_last4','ia_metodo_pago'=>'payment_method','ia_invoice_fingerprint'=>'invoice_fingerprint','ia_project_match'=>'project_match','ia_expected_projects'=>'expected_projects'];
foreach($cases as $case) {
 $c=$case['context'];$reference=new ReceiptReference($c['worked_projects']);
 $r=$reference->compare(['amount'=>$c['amount'],'expense_date'=>$c['expense_date'],'project_external_id'=>$c['project_id'],'pay_method'=>$c['pay_method']],$case['data']);
 $expected=[];foreach($map as $key=>$name){ $expected[$name]=$name==='project_match'?(bool)$r[$key]:$r[$key]; }
 if($expected!=$case['actual']) { fwrite(STDERR,"Reference difference: ".$case['name']."\n".json_encode(['reference'=>$expected,'saas'=>$case['actual']],JSON_UNESCAPED_UNICODE)."\n");exit(1); }
}
echo "ADT receipt reference: ".count($cases)." independent comparisons passed.\n";
