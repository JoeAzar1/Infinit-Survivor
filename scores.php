<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
$file = __DIR__ . '/scores.json';
if (!file_exists($file)) {
  file_put_contents($file, '[]');
}
$scores = json_decode(file_get_contents($file) ?: '[]', true);
if (!is_array($scores)) $scores = [];
usort($scores, static fn($a, $b) => ((int)($b['score'] ?? 0)) <=> ((int)($a['score'] ?? 0)));
echo json_encode(['scores' => array_slice($scores, 0, 10)], JSON_UNESCAPED_UNICODE);
