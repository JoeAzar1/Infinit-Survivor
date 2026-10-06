'use strict';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const distanceEl = document.getElementById('distance');
const bestEl = document.getElementById('best');
const startOverlay = document.getElementById('startOverlay');
const deathOverlay = document.getElementById('deathOverlay');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const saveScoreButton = document.getElementById('saveScoreButton');
const finalDistanceEl = document.getElementById('finalDistance');
const deathReasonEl = document.getElementById('deathReason');
const playerNameEl = document.getElementById('playerName');
const saveStatusEl = document.getElementById('saveStatus');
const leaderboardEl = document.getElementById('leaderboard');

const GRAVITY = 0.62;
const MOVE_ACCEL = 0.72;
const FRICTION = 0.82;
const MAX_SPEED = 5.8;
const JUMP = -12.8;
const PLAYER_SPEED_REF = MAX_SPEED;
const FIREBALL_SPEED = PLAYER_SPEED_REF * 0.5;
const GROUND_Y = 445;
const PX_PER_METER = 10;

const keys = new Set();
const pressed = new Set();
const clouds = [];

let game = null;
let lastTime = 0;
let animationId = null;
let bestDistance = Number(localStorage.getItem('infiniteSurvivorBest') || 0);
bestEl.textContent = `${Math.floor(bestDistance)} m`;

function resetGame() {
  pressed.clear();
  game = {
    running: true,
    worldX: 0,
    lastGeneratedX: 1500,
    difficulty: 1,
    distance: 0,
    deathReason: '',
    player: {
      x: 150,
      y: GROUND_Y - 42,
      w: 27,
      h: 42,
      vx: 0,
      vy: 0,
      onGround: true,
      invuln: 0,
      frame: 0
    },
    platforms: [{ x: -300, y: GROUND_Y, w: 1800, h: 95 }],
    mines: [],
    fireballs: [],
    particles: [],
    generatedFireballAt: 0,
    shake: 0
  };

  while (game.lastGeneratedX < 2400) generateChunk();
  updateHud();
  hideOverlay(deathOverlay);
}

function generateChunk() {
  // The visual ground is endless, so collision ground must also be generated endlessly.
  // Each chunk extends the playable ground from the previous chunk to the new end.
  const start = game.lastGeneratedX;
  const gap = rand(130, 320);
  const x = start + gap;
  const end = x + rand(320, 560);

  game.platforms.push({
    x: start,
    y: GROUND_Y,
    w: end - start,
    h: 95
  });

  const obstacleRoll = Math.random();
  if (obstacleRoll < 0.54) {
    game.mines.push({
      x,
      y: GROUND_Y - 12,
      r: 11,
      state: 'idle',
      timer: 0,
      explodeRadius: 60
    });
  }

  if (game.distance > 100 && Math.random() < Math.min(0.18 + game.difficulty * 0.03, 0.42)) {
    game.mines.push({
      x: x + rand(90, 190),
      y: GROUND_Y - 12,
      r: 11,
      state: 'idle',
      timer: 0,
      explodeRadius: 60
    });
  }

  if (game.distance > 250 && Math.random() < Math.min(0.10 + game.difficulty * 0.025, 0.34)) {
    spawnFireball(x + rand(420, 650));
  }

  if (Math.random() < 0.12) {
    const platformX = x + rand(140, 260);
    game.platforms.push({
      x: platformX,
      y: GROUND_Y - rand(75, 130),
      w: rand(120, 220),
      h: 18
    });
  }

  game.lastGeneratedX = end;
}

function spawnFireball(x) {
  if (game.fireballs.length >= 4) return;
  game.fireballs.push({
    x,
    y: rand(190, GROUND_Y - 80),
    r: 13,
    speed: FIREBALL_SPEED,
    phase: Math.random() * Math.PI * 2
  });
}

function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function startGame() {
  resetGame();
  hideOverlay(startOverlay);
  ensureLoop();
}

function ensureLoop() {
  if (animationId === null) animationId = requestAnimationFrame(loop);
}

function loop(timestamp) {
  animationId = requestAnimationFrame(loop);
  if (!lastTime) lastTime = timestamp;
  const dt = clamp((timestamp - lastTime) / 16.6667, 0, 2);
  lastTime = timestamp;

  if (game?.running) update(dt);
  draw(timestamp);
}

function update(dt) {
  const p = game.player;
  p.frame += dt;
  if (p.invuln > 0) p.invuln -= dt;
  game.shake = Math.max(0, game.shake - dt);

  const left = keys.has('ArrowLeft') || keys.has('a');
  const right = keys.has('ArrowRight') || keys.has('d');
  if (left) p.vx -= MOVE_ACCEL * dt;
  if (right) p.vx += MOVE_ACCEL * dt;
  if (!left && !right) p.vx *= Math.pow(FRICTION, dt);
  p.vx = clamp(p.vx, -MAX_SPEED, MAX_SPEED);

  if ((pressed.has('Space') || pressed.has('ArrowUp') || pressed.has('w')) && p.onGround) {
    p.vy = JUMP;
    p.onGround = false;
    burst(p.x + p.w / 2, p.y + p.h, 7, 'jump');
  }

  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  resolvePlatforms(p);
  if (p.y > H + 100) return die('Tu es tombé hors de la zone de jeu.');

  const forwardProgress = Math.max(0, p.x - 150);
  if (forwardProgress > 0) game.worldX = forwardProgress;
  game.distance = game.worldX / PX_PER_METER;
  game.difficulty = 1 + game.distance / 900;

  while (game.lastGeneratedX < game.worldX + 1900) generateChunk();
  cleanupWorld();
  updateMines(dt);
  updateFireballs(dt);
  updateParticles(dt);

  if (Math.floor(game.distance) !== Number(distanceEl.dataset.last || -1)) updateHud();
  pressed.clear();
}

function resolvePlatforms(p) {
  p.onGround = false;
  const candidates = game.platforms;
  for (const platform of candidates) {
    if (p.x + p.w <= platform.x || p.x >= platform.x + platform.w) continue;
    const wasAbove = p.y + p.h - p.vy <= platform.y + 6;
    if (p.vy >= 0 && p.y + p.h >= platform.y && wasAbove) {
      p.y = platform.y - p.h;
      p.vy = 0;
      p.onGround = true;
    }
  }
}

function updateMines(dt) {
  const p = game.player;
  for (const mine of game.mines) {
    if (mine.state === 'idle') {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      if (Math.abs(cx - mine.x) < 43 && Math.abs(cy - mine.y) < 55) {
        mine.state = 'armed';
        mine.timer = 0.5;
        burst(mine.x, mine.y, 6, 'spark');
      }
    } else if (mine.state === 'armed') {
      mine.timer -= dt / 60;
      if (mine.timer <= 0) explodeMine(mine);
    }
  }
}

function explodeMine(mine) {
  mine.state = 'exploded';
  game.shake = 9;
  burst(mine.x, mine.y, 28, 'explosion');
  const dx = game.player.x + game.player.w / 2 - mine.x;
  const dy = game.player.y + game.player.h / 2 - mine.y;
  if (Math.hypot(dx, dy) < mine.explodeRadius) die('Une mine a explosé trop près de toi.');
}

function updateFireballs(dt) {
  const p = game.player;
  for (const f of game.fireballs) {
    const targetX = p.x + p.w / 2;
    const targetY = p.y + p.h / 2;
    const dx = targetX - f.x;
    const dy = targetY - f.y;
    const d = Math.hypot(dx, dy) || 1;
    const speed = f.speed * (1 + Math.min(game.distance / 6000, 0.18));
    f.x += (dx / d) * speed * dt;
    f.y += (dy / d) * speed * 0.82 * dt + Math.sin((f.x + f.phase) / 30) * 0.35 * dt;

    if (d < f.r + 18) die('Une boule de feu t’a rattrapé.');
  }
}

function cleanupWorld() {
  const cutoff = game.worldX - 900;
  game.mines = game.mines.filter(m => m.x > cutoff && m.state !== 'exploded');
  game.platforms = game.platforms.filter(p => p.x + p.w > cutoff || p.x < 1000);
  game.fireballs = game.fireballs.filter(f => f.x > game.worldX - 1200 && f.x < game.worldX + 3000);
}

function updateParticles(dt) {
  for (const q of game.particles) {
    q.x += q.vx * dt;
    q.y += q.vy * dt;
    q.vy += q.g * dt;
    q.life -= dt;
  }
  game.particles = game.particles.filter(q => q.life > 0);
}

function burst(x, y, count, type) {
  const colors = type === 'explosion' ? ['#ff5d75', '#ff9f43', '#ffe66d'] : ['#5ee7ff', '#ffffff', '#8da7ff'];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = type === 'explosion' ? rand(1.8, 5.8) : rand(1, 3.6);
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5,
      g: type === 'explosion' ? 0.14 : 0.09,
      life: type === 'explosion' ? rand(22, 42) : rand(16, 28),
      size: rand(2, 5), color: colors[(Math.random() * colors.length) | 0]
    });
  }
}

function die(reason) {
  if (!game.running) return;
  game.running = false;
  game.deathReason = reason;
  game.shake = 14;
  burst(game.player.x + game.player.w / 2, game.player.y + game.player.h / 2, 35, 'explosion');

  const score = Math.floor(game.distance);
  if (score > bestDistance) {
    bestDistance = score;
    localStorage.setItem('infiniteSurvivorBest', String(bestDistance));
  }

  finalDistanceEl.textContent = `${score} m`;
  deathReasonEl.textContent = reason;
  bestEl.textContent = `${bestDistance} m`;
  playerNameEl.value = localStorage.getItem('infiniteSurvivorName') || '';
  saveStatusEl.textContent = '';
  showOverlay(deathOverlay);
  loadLeaderboard();
}

function updateHud() {
  const meters = Math.floor(game.distance);
  distanceEl.textContent = `${meters} m`;
  distanceEl.dataset.last = String(meters);
  bestEl.textContent = `${bestDistance} m`;
}

function showOverlay(el) { el.classList.add('visible'); }
function hideOverlay(el) { el.classList.remove('visible'); }

function worldToScreenX(worldX) { return worldX - game.worldX + 150; }

function draw(timestamp) {
  const shakeX = game?.shake ? rand(-game.shake, game.shake) : 0;
  const shakeY = game?.shake ? rand(-game.shake, game.shake) : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawSky(timestamp);
  drawWorld();
  if (game) drawPlayer();
  ctx.restore();
}

function drawSky(timestamp) {
  const t = timestamp / 1000;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#07111e');
  grad.addColorStop(1, '#102338');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(100,170,220,0.18)';
  for (let i = 0; i < 14; i++) {
    const x = ((i * 177 - (game?.worldX || 0) * 0.08) % (W + 120)) - 60;
    const y = 55 + (i * 43) % 190;
    const r = 1.4 + ((i * 11) % 8) / 3;
    ctx.beginPath(); ctx.arc(x, y + Math.sin(t + i) * 3, r, 0, Math.PI * 2); ctx.fill();
  }

  ctx.fillStyle = '#0b1a29';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y - 80);
  for (let x = 0; x <= W; x += 35) {
    const world = x + (game?.worldX || 0) * 0.22;
    const y = GROUND_Y - 80 - (Math.sin(world / 160) * 28 + Math.sin(world / 57) * 11);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GROUND_Y); ctx.lineTo(0, GROUND_Y); ctx.closePath(); ctx.fill();
}

function drawWorld() {
  const groundY = GROUND_Y;
  ctx.fillStyle = '#132238';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.fillStyle = '#1d334a';
  ctx.fillRect(0, groundY, W, 6);

  for (let x = ((-game.worldX) % 50) - 50; x < W + 50; x += 50) {
    ctx.fillStyle = 'rgba(94,231,255,.10)';
    ctx.fillRect(x, groundY + 28, 28, 2);
  }

  for (const platform of game.platforms) {
    const sx = worldToScreenX(platform.x);
    if (sx > W || sx + platform.w < 0) continue;
    ctx.fillStyle = '#29425f';
    ctx.fillRect(sx, platform.y, platform.w, platform.h);
    ctx.fillStyle = '#5b7594';
    ctx.fillRect(sx, platform.y, platform.w, 4);
  }

  for (const mine of game.mines) {
    const sx = worldToScreenX(mine.x);
    if (sx < -50 || sx > W + 50) continue;
    if (mine.state === 'armed') {
      const pulse = 1 + Math.sin(performance.now() / 55) * .15;
      ctx.strokeStyle = '#ff5d75';
      ctx.globalAlpha = .45;
      ctx.beginPath(); ctx.arc(sx, mine.y, 22 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = mine.state === 'armed' ? '#ff5d75' : '#121923';
    ctx.beginPath(); ctx.arc(sx, mine.y, mine.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6f7c90'; ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#dbe7f5';
    ctx.beginPath(); ctx.arc(sx, mine.y - 4, 2, 0, Math.PI * 2); ctx.fill();
  }

  for (const f of game.fireballs) drawFireball(f);
  for (const q of game.particles) drawParticle(q);
}

function drawFireball(f) {
  const x = worldToScreenX(f.x);
  const y = f.y;
  const gradient = ctx.createRadialGradient(x, y, 1, x, y, 21);
  gradient.addColorStop(0, '#fff4b0');
  gradient.addColorStop(.3, '#ffbd59');
  gradient.addColorStop(1, 'rgba(255,70,90,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff6b3d';
  ctx.beginPath(); ctx.arc(x, y, f.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff0ad';
  ctx.beginPath(); ctx.arc(x - 3, y - 3, 5, 0, Math.PI * 2); ctx.fill();
}

function drawParticle(q) {
  const x = worldToScreenX(q.x);
  ctx.globalAlpha = clamp(q.life / 28, 0, 1);
  ctx.fillStyle = q.color;
  ctx.fillRect(x, q.y, q.size, q.size);
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  const p = game.player;
  const x = worldToScreenX(p.x);
  const y = p.y;
  const walk = p.onGround ? Math.sin(p.frame * .55) * 4 : 0;
  ctx.save();
  if (p.invuln > 0 && Math.floor(p.invuln * 10) % 2 === 0) ctx.globalAlpha = .55;

  ctx.strokeStyle = '#f3f7ff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 13, y + 26); ctx.lineTo(x + 8 - walk, y + 42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 14, y + 26); ctx.lineTo(x + 20 + walk, y + 42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 13, y + 15); ctx.lineTo(x + 4 + walk * .2, y + 23); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 14, y + 15); ctx.lineTo(x + 23 - walk * .2, y + 22); ctx.stroke();

  ctx.fillStyle = '#edf4ff';
  ctx.beginPath(); ctx.arc(x + 13.5, y + 8, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#09111d';
  ctx.beginPath(); ctx.arc(x + 10.5, y + 7, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 16.5, y + 7, 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5ee7ff';
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x + 13, y + 17); ctx.lineTo(x + 13, y + 29); ctx.stroke();
  ctx.restore();
}

function keyName(e) {
  if (e.code === 'Space') return 'Space';
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

window.addEventListener('keydown', (e) => {
  const k = keyName(e);
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(k)) e.preventDefault();
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
  ensureLoop();
});
window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
window.addEventListener('blur', () => { keys.clear(); pressed.clear(); });

startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);

saveScoreButton.addEventListener('click', async () => {
  const name = playerNameEl.value.trim().slice(0, 18) || 'Joueur';
  const score = Math.floor(game?.distance || 0);
  localStorage.setItem('infiniteSurvivorName', name);
  saveStatusEl.textContent = 'Enregistrement…';
  try {
    const response = await fetch('save_score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score })
    });
    if (!response.ok) throw new Error('HTTP');
    const data = await response.json();
    saveStatusEl.textContent = data.ok ? 'Score enregistré.' : (data.error || 'Impossible de sauvegarder.');
    loadLeaderboard();
  } catch {
    saveStatusEl.textContent = 'Serveur PHP indisponible : le record local reste sauvegardé.';
  }
});

async function loadLeaderboard() {
  try {
    const response = await fetch('scores.php', { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP');
    const data = await response.json();
    const rows = Array.isArray(data.scores) ? data.scores.slice(0, 10) : [];
    leaderboardEl.innerHTML = '<h3>Classement</h3>' + (rows.length
      ? rows.map((s, i) => `<div class="score-line"><span>${i + 1}. ${escapeHtml(s.name)}</span><strong>${Number(s.score) || 0} m</strong></div>`).join('')
      : '<div class="score-line"><span>Aucun score enregistré.</span></div>');
  } catch {
    leaderboardEl.innerHTML = '<h3>Classement</h3><div class="score-line"><span>Disponible avec le serveur PHP.</span></div>';
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

resetGame();
loadLeaderboard();
ensureLoop();
