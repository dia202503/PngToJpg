(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const lblDistance = document.getElementById('lblDistance');
  const lblCoins = document.getElementById('lblCoins');
  const lblSpeed = document.getElementById('lblSpeed');
  const lblState = document.getElementById('lblState');

  const GROUND_Y = canvas.height - 72;
  const GRAVITY = 0.6;
  const JUMP_V = -11;
  const PLAYER = { x: 120, y: GROUND_Y, w: 38, h: 48, vy: 0, jumps: 0, alive: true };

  let lastTime = performance.now();
  let distance = 0;
  let coins = 0;
  let speed = 5;
  let obstacleTimer = 0;
  let coinTimer = 0;
  let paused = false;
  let state = 'Ready';
  let backgroundShift = 0;

  const obstacles = [];
  const pickups = [];
  const input = new Set();

  function resetGame() {
    obstacles.length = 0;
    pickups.length = 0;
    PLAYER.x = 120; PLAYER.y = GROUND_Y; PLAYER.vy = 0; PLAYER.jumps = 0; PLAYER.alive = true;
    distance = 0; coins = 0; speed = 5; obstacleTimer = 0; coinTimer = 0; paused = false;
    state = 'Running'; lblState.textContent = state;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  function spawnObstacle() {
    const height = 30 + Math.random() * 40;
    const width = 30 + Math.random() * 35;
    const gapY = GROUND_Y - height;
    obstacles.push({ x: canvas.width + 40, y: gapY, w: width, h: height, color: '#f472b6' });
  }

  function spawnCoinRow() {
    const rowY = GROUND_Y - 120 - Math.random() * 60;
    const count = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      pickups.push({ x: canvas.width + 60 + i * 36, y: rowY, r: 9, color: '#fbbf24', spin: Math.random() * Math.PI * 2 });
    }
  }

  function makePeaks(count, baseHeight, variance, seed) {
    const peaks = [];
    let s = seed;
    for (let i = 0; i < count; i++) {
      s = (s * 9301 + 49297) % 233280;
      const w = 120 + (s / 233280) * 50;
      s = (s * 9301 + 49297) % 233280;
      const h = baseHeight + (s / 233280) * variance;
      peaks.push({ x: i * 180, w, h });
    }
    return peaks;
  }

  const bgLayers = [
    { color: '#162340', height: canvas.height * 0.5, speed: 0.2, peaks: makePeaks(7, canvas.height * 0.18, 60, 7) },
    { color: '#0f1a32', height: canvas.height * 0.35, speed: 0.4, peaks: makePeaks(8, canvas.height * 0.16, 40, 19) }
  ];

  function drawBackground(dt) {
    backgroundShift += speed * dt * 0.0015;
    bgLayers.forEach(layer => {
      ctx.fillStyle = layer.color;
      const offset = (backgroundShift * layer.speed) % canvas.width;
      ctx.fillRect(-offset, canvas.height - layer.height, canvas.width * 2, layer.height);
      ctx.fillStyle = '#0b1224';
      layer.peaks.forEach(p => {
        const x = p.x - offset * layer.speed;
        ctx.fillRect(x, canvas.height - p.h, p.w, p.h);
      });
    });
    ctx.fillStyle = '#0d152c';
    ctx.fillRect(0, GROUND_Y + 48, canvas.width, canvas.height - (GROUND_Y + 48));
    ctx.fillStyle = '#0b1224';
    ctx.fillRect(0, GROUND_Y + 12, canvas.width, 60);
  }

  function drawPlayer() {
    ctx.save();
    ctx.shadowColor = 'rgba(37,99,235,0.3)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(PLAYER.x, PLAYER.y - PLAYER.h, PLAYER.w, PLAYER.h);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(PLAYER.x + 8, PLAYER.y - PLAYER.h + 10, 10, 10);
    ctx.fillRect(PLAYER.x + PLAYER.w - 18, PLAYER.y - PLAYER.h + 10, 10, 10);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(PLAYER.x + 10, PLAYER.y - 16, PLAYER.w - 20, 10);
    ctx.restore();
  }

  function drawObstacles() {
    obstacles.forEach(ob => {
      ctx.fillStyle = ob.color;
      ctx.beginPath();
      ctx.moveTo(ob.x, ob.y);
      ctx.lineTo(ob.x + ob.w, ob.y);
      ctx.lineTo(ob.x + ob.w / 2, ob.y - ob.h);
      ctx.closePath();
      ctx.fill();
    });
  }

  function drawCoins(dt) {
    pickups.forEach(c => {
      c.spin += dt * 0.01;
      const scale = 0.6 + Math.sin(c.spin) * 0.4;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(scale, 1);
      ctx.beginPath();
      ctx.fillStyle = c.color;
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(-2, -c.r + 3, 4, c.r * 2 - 6);
      ctx.restore();
    });
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y > b.y - b.h && a.y - a.h < b.y;
  }

  function updatePlayer(dt) {
    if (shouldJump()) attemptJump();
    PLAYER.vy += GRAVITY;
    PLAYER.y += PLAYER.vy;
    if (PLAYER.y >= GROUND_Y) {
      PLAYER.y = GROUND_Y;
      PLAYER.vy = 0;
      PLAYER.jumps = 0;
    }
  }

  function shouldJump() {
    return (input.has(' ') || input.has('ArrowUp') || input.has('w'));
  }

  function attemptJump() {
    if (PLAYER.jumps < 2) {
      PLAYER.vy = JUMP_V;
      PLAYER.jumps++;
    }
    // Prevent holding the button to auto multi-jump
    input.delete(' '); input.delete('ArrowUp'); input.delete('w');
  }

  function updateObstacles(dt) {
    obstacleTimer -= dt;
    if (obstacleTimer <= 0) {
      spawnObstacle();
      obstacleTimer = 900 - Math.min(650, distance * 0.5);
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.x -= speed * (1 + distance * 0.0003);
      if (ob.x + ob.w < -20) obstacles.splice(i, 1);
      if (intersects({ x: PLAYER.x, y: PLAYER.y, w: PLAYER.w, h: PLAYER.h }, ob)) {
        PLAYER.alive = false;
      }
    }
  }

  function updateCoins(dt) {
    coinTimer -= dt;
    if (coinTimer <= 0) {
      spawnCoinRow();
      coinTimer = 1200 + Math.random() * 800;
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const c = pickups[i];
      c.x -= speed * (1 + distance * 0.0003);
      const rect = { x: c.x - c.r, y: c.y + c.r, w: c.r * 2, h: c.r * 2 };
      if (intersects({ x: PLAYER.x, y: PLAYER.y, w: PLAYER.w, h: PLAYER.h }, rect)) {
        coins++;
        pickups.splice(i, 1);
      } else if (c.x < -40) {
        pickups.splice(i, 1);
      }
    }
  }

  function updateHUD() {
    lblDistance.textContent = distance.toFixed(0);
    lblCoins.textContent = coins;
    lblSpeed.textContent = speed.toFixed(1);
    lblState.textContent = state;
  }

  function drawGroundLines() {
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 1);
    ctx.lineTo(canvas.width, GROUND_Y + 1);
    ctx.stroke();
    ctx.strokeStyle = '#111827';
    for (let x = 0; x < canvas.width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x - (distance % 32), GROUND_Y + 2);
      ctx.lineTo(x - (distance % 32) + 12, GROUND_Y + 14);
      ctx.stroke();
    }
  }

  function loop(now) {
    if (state !== 'Running') return;
    const dt = now - lastTime;
    lastTime = now;
    if (paused) {
      requestAnimationFrame(loop);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(dt);
    drawGroundLines();

    speed = Math.min(15, speed + dt * 0.0008);
    distance += (speed * dt) * 0.06;

    updatePlayer(dt);
    updateObstacles(dt);
    updateCoins(dt);
    drawObstacles();
    drawCoins(dt);
    drawPlayer();
    updateHUD();

    if (!PLAYER.alive) {
      state = 'Game Over';
      lblState.textContent = state;
      drawGameOver();
      return;
    }
    requestAnimationFrame(loop);
  }

  function drawGameOver() {
    ctx.save();
    ctx.fillStyle = 'rgba(15,23,42,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.font = '32px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = '18px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText('Enter で再スタート / P でポーズ切替', canvas.width / 2, canvas.height / 2 + 26);
    ctx.fillText(`距離 ${distance.toFixed(0)} m  |  コイン ${coins}`, canvas.width / 2, canvas.height / 2 + 54);
    ctx.restore();
  }

  function togglePause() {
    paused = !paused;
    state = paused ? 'Paused' : 'Running';
    lblState.textContent = state;
    if (!paused) {
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      input.add(e.key === ' ' ? ' ' : (e.key === 'ArrowUp' ? 'ArrowUp' : 'w'));
    }
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'Enter' && state === 'Game Over') resetGame();
    if (state === 'Ready' && e.code === 'Enter') resetGame();
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
      input.delete(e.key === ' ' ? ' ' : (e.key === 'ArrowUp' ? 'ArrowUp' : 'w'));
    }
  });

  // 初期描画
  ctx.fillStyle = '#0b1224';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '22px "Segoe UI", "Noto Sans JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Enter を押してスタート', canvas.width / 2, canvas.height / 2);
})();
