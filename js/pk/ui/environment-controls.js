export function initEnvironmentControls(world) {
  const menu = document.getElementById('environmentMenu');
  const time = document.getElementById('timeMode'), weather = document.getElementById('weatherMode');
  const label = document.getElementById('environmentLabel');
  try {
    const saved = JSON.parse(localStorage.getItem('sm_pk_environment') || '{}');
    world.environment.setOptions(saved);
  } catch (_) { /* 损坏的旧设置回到自动 */ }
  const state = world.environment.state(); time.value = state.time; weather.value = state.weather;
  function change() {
    const options = { time: time.value, weather: weather.value };
    world.environment.setOptions(options);
    try { localStorage.setItem('sm_pk_environment', JSON.stringify(options)); } catch (_) { /* 私密浏览 */ }
  }
  time.onchange = weather.onchange = change;
  menu.addEventListener('keydown', e => { if (e.key === 'Escape') menu.open = false; e.stopPropagation(); });
  document.addEventListener('pointerdown', e => { if (!menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menu.open = false; });
  const timer = setInterval(() => { label.textContent = world.environment.state().label; }, 500);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  label.textContent = state.label;
}
