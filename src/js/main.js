import '@fontsource-variable/inter';
import '../styles/main.css';

const root = document.documentElement;
const stored = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyTheme(theme) {
  root.dataset.theme = theme;
  for (const toggle of document.querySelectorAll('.theme-toggle')) {
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}

applyTheme(stored ?? (prefersDark ? 'dark' : 'light'));

for (const toggle of document.querySelectorAll('.theme-toggle')) {
  toggle.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    applyTheme(next);
  });
}

const menuToggle = document.querySelector('.menu-toggle');
menuToggle?.addEventListener('click', () => {
  const open = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!open));
});
