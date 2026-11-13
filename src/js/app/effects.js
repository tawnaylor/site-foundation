// Confetti, floating "+XP" text, and toast messages.
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.createElement('canvas');
canvas.className = 'confetti';
canvas.setAttribute('aria-hidden', 'true');
document.body.append(canvas);
const ctx = canvas.getContext('2d');

let parts = [];
let raf = 0;
const COLORS = [
  '#22d3ee',
  '#e879f9',
  '#a3e635',
  '#fbbf24',
  '#fb7185',
  '#818cf8',
];

function step() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life > 0 && p.y < canvas.height + 20);
  for (const p of parts) {
    p.vy += 0.18;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(step) : 0;
  if (!raf) ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function burst(x = innerWidth / 2, y = innerHeight / 2, count = 120) {
  if (reduced()) return;
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    parts.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5,
      vr: (Math.random() - 0.5) * 0.4,
      rot: Math.random() * Math.PI,
      size: 6 + Math.random() * 8,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 90 + Math.random() * 60,
    });
  }
  if (!raf) raf = requestAnimationFrame(step);
}

export function floatText(text, x = innerWidth / 2, y = innerHeight / 2) {
  const el = document.createElement('div');
  el.className = 'float-xp';
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1600);
}

export function toast(message, kind = '') {
  const box = document.querySelector('#toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), 4000);
}
