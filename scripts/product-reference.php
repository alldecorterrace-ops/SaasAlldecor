<?php
if($argc!==4||!preg_match('/^[a-f0-9]{64}$/',$argv[3])){fwrite(STDERR,"Expected source, synthetic cases and SHA256\n");exit(2);}
if(!hash_equals($argv[3],hash_file('sha256',$argv[1]))){fwrite(STDERR,"Product reference source mismatch\n");exit(2);}
if(!function_exists('mb_strlen')){fwrite(STDERR,"The native product reference requires mbstring\n");exit(2);}
require $argv[1];
use Drupal\adt_crm2026\Service\ProductDetails;
$cases=json_decode(file_get_contents($argv[2]),true,512,JSON_THROW_ON_ERROR);
foreach($cases as $case){
 try{$normalized=ProductDetails::normalize($case['input']);$actual=['ok'=>true,'normalized'=>$normalized,'summary'=>ProductDetails::summary($normalized)];}
 catch(Throwable $e){$actual=['ok'=>false];}
 if($actual!=$case['actual']){fwrite(STDERR,"ADT product difference: ".$case['name']."\n".json_encode(['reference'=>$actual,'saas'=>$case['actual']],JSON_UNESCAPED_UNICODE)."\n");exit(1);}
}
echo 'ADT product reference: '.count($cases)." independent comparisons passed; text, Unicode, units, bounds, summary and gallery rules.\n";
