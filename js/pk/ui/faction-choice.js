const CAMP = { female: '蓝方 · 女将军', male: '红方 · 男将军' };

export function initFactionChoice(net) {
  const buttons = [...document.querySelectorAll('[data-faction-choice]')];
  const positions = [...document.querySelectorAll('[data-deployment]')];
  let factions = ['female', 'male'];
  let saved = 'female';
  try { saved = localStorage.getItem('sm_pk_faction') || saved; } catch (_) { /* 私密浏览 */ }

  function select(key) {
    net.faction = key === 'male' ? 'male' : 'female';
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.factionChoice === net.faction)));
    try { localStorage.setItem('sm_pk_faction', net.faction); } catch (_) { /* 私密浏览 */ }
  }
  buttons.forEach(b => { b.onclick = () => select(b.dataset.factionChoice); });
  select(saved);
  function selectDeployment(value) {
    net.deployment = value === 'right' ? 'right' : 'left';
    positions.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.deployment === net.deployment)));
    try { localStorage.setItem('sm_pk_deployment', net.deployment); } catch (_) { /* 私密浏览 */ }
  }
  positions.forEach(b => { b.onclick = () => selectDeployment(b.dataset.deployment); });
  let deployment = 'left';
  try { deployment = localStorage.getItem('sm_pk_deployment') || deployment; } catch (_) { /* 私密浏览 */ }
  selectDeployment(deployment);

  return {
    paint(side, roomFactions) {
      if (roomFactions) factions = roomFactions;
      const camp = CAMP[factions[side]];
      document.getElementById('hud').dataset.side = String(side);
      ['Me', 'Op'].forEach((name, i) => {
        const physical = i ? 1 - side : side;
        const el = document.getElementById('camp' + name);
        el.textContent = CAMP[factions[physical]] + (physical ? ' · 右侧' : ' · 左侧');
        const card = el.closest('.side');
        card.classList.toggle('left', physical === 0);
        card.classList.toggle('right', physical === 1);
        card.dataset.faction = factions[physical];
      });
      document.getElementById('waitCamp').textContent = '你的阵营：' + camp + (side ? ' · 右侧向左进攻' : ' · 左侧向右进攻');
    },
  };
}
