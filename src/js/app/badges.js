// Generates a shield badge as inline SVG. Color comes from the rank's tier.
let uid = 0;

const SHIELD = 'M50 4 92 20v38c0 30-20 50-42 58C28 108 8 88 8 58V20Z';

export function badgeSvg(rank, { locked = false } = {}) {
  const id = `badge${uid++}`;
  const h = rank.hue;
  const pips = Array.from({ length: rank.sub }, (_, i) => {
    const cx = 50 - (rank.sub - 1) * 2.5 + i * 5;
    return `<circle cx="${cx}" cy="100" r="1.8" fill="hsl(${h},100%,92%)"/>`;
  }).join('');

  return `<svg class="badge${locked ? ' locked' : ''}" viewBox="0 0 100 120" role="img" aria-label="${rank.name}, level ${rank.level}">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="hsl(${h},90%,62%)"/>
        <stop offset="1" stop-color="hsl(${(h + 40) % 360},85%,28%)"/>
      </linearGradient>
      <radialGradient id="${id}s" cx="50%" cy="22%" r="60%">
        <stop offset="0" stop-color="#fff" stop-opacity=".5"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <path d="${SHIELD}" fill="url(#${id})" stroke="hsl(${h},95%,82%)" stroke-width="3" stroke-linejoin="round"/>
    <path d="${SHIELD}" fill="url(#${id}s)"/>
    <path d="M50 12 84 25v33c0 25-16 42-34 49C32 100 16 83 16 58V25Z" fill="none" stroke="hsl(${h},95%,88%)" stroke-opacity=".5" stroke-width="1.5"/>
    <text x="50" y="56" text-anchor="middle" font-size="30">${rank.icon}</text>
    <text x="50" y="81" text-anchor="middle" font-size="18" font-weight="800" fill="#fff">${rank.level}</text>
    ${pips}
  </svg>`;
}
