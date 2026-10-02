<?php
if($argc!==4||!preg_match('/^[a-f0-9]{64}$/',$argv[3])){fwrite(STDERR,"Expected pure source, synthetic cases and SHA256\n");exit(2);}
if(!hash_equals($argv[3],hash_file('sha256',$argv[1]))){fwrite(STDERR,"Pricing source mismatch\n");exit(2);}
if(!function_exists('mb_strtolower')){fwrite(STDERR,"Pricing reference requires mbstring\n");exit(2);}
require $argv[1];
$cases=json_decode(file_get_contents($argv[2]),true,512,JSON_THROW_ON_ERROR);
$source=new PricingSource;
function canonical($v){if(is_array($v)){foreach($v as &$x){$x=canonical($x);}unset($x);if(array_keys($v)!==range(0,count($v)-1)){ksort($v);}}return $v;}
foreach($cases as $case){
 $saved=!empty($case['restore'])?NULL:$source->capture($case['input']);
 $effective=$source->effective($saved??[]);
 // The form shows both PHP blank numeric defaults and NULL as empty inputs.
 foreach(['techo','estructura','pared','cocina'] as $area){foreach($effective['componentes'][$area] as &$r){foreach(['cant','precio'] as $k){if($r[$k]===''){$r[$k]=NULL;}}}unset($r);}
 $actual=json_decode(json_encode(['saved'=>$saved,'effective'=>$effective,'rates'=>$source->ratesFromComponentes($effective)],JSON_THROW_ON_ERROR),true,512,JSON_THROW_ON_ERROR);
 // JSON objects with no entries become [] in associative PHP decoding.
 if(canonical($actual)!==canonical($case['actual'])){fwrite(STDERR,"ADT pricing difference: ".$case['name']."\n".json_encode(['reference'=>$actual,'saas'=>$case['actual']],JSON_UNESCAPED_UNICODE)."\n");exit(1);}
}
echo 'ADT pricing reference: '.count($cases)." independent comparisons passed.\n";
