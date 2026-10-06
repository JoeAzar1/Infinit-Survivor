<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$data = json_decode(file_get_contents('php://input') ?: '{}', true);
$name = trim((string)($data['name'] ?? 'Joueur'));
$score = (int)($data['score'] ?? 0);
$name = preg_replace('/[^\p{L}\p{N}_ .-]/u', '', $name) ?? 'Joueur';
$name = $name ?: 'Joueur';
if (function_exists('mb_substr')) {
  $name = mb_substr($name, 0, 18);
} else {
  $name = substr($name, 0, 18);
}
$score = max(0, min($score, 100000000));

$file = __DIR__ . '/scores.json';
$fp = fopen($file, 'c+');
if (!$fp) { http_response_code(500); echo json_encode(['ok'=>false,'error'=>'Fichier de scores inaccessible.']); exit; }

flock($fp, LOCK_EX);
rewind($fp);
$raw = stream_get_contents($fp);
$scores = json_decode($raw ?: '[]', true);
if (!is_array($scores)) $scores = [];

$scores[] = [
  'name' => $name,
  'score' => $score,
  'date' => date('c')
];

usort($scores, static fn($a, $b) => ((int)$b['score']) <=> ((int)$a['score']));
$scores = array_slice($scores, 0, 100);

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($scores, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

echo json_encode(['ok'=>true,'score'=>$score]);
