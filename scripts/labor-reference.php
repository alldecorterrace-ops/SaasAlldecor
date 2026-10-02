<?php
// Only the frozen pure model; no Drupal/database/HTTP or real records are loaded.
if($argc!==4 || !preg_match('/^[a-f0-9]{64}$/',$argv[3])) {fwrite(STDERR,"Expected source, cases and SHA256\n");exit(2);}
if(!hash_equals($argv[3],hash_file('sha256',$argv[1]))) {fwrite(STDERR,"Reference source mismatch\n");exit(2);}
require $argv[1];
$cases=json_decode(file_get_contents($argv[2]),true,512,JSON_THROW_ON_ERROR);
foreach($cases as $case) {
 $i=$case['input'];
 try { $result=\Drupal\adt_crm2026\Domain\LaborCostModel::preview($i['entries'],$i['rates'],$i['projects'],$i['adjustments'],$i['splitRule']??'review');$expected=['result'=>$result]; }
 catch(\InvalidArgumentException $e) {$expected=['error'=>true];}
 if($expected!=$case['actual']) {fwrite(STDERR,"Labor reference difference: ".$case['name']."\n".json_encode(['reference'=>$expected,'saas'=>$case['actual']],JSON_UNESCAPED_UNICODE)."\n");exit(1);}
}
echo "ADT labor reference: ".count($cases)." independent comparisons passed.\n";
