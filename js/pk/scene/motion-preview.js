// 从真实服务器混战回放检查接敌、包围、转身和连续出招，复用正式战场的全部同步与姿态逻辑。
export async function startMotionPreview(world) {
  const siege = new URLSearchParams(location.search).get('scene') === 'siege';
  const response = await fetch(siege ? './assets/pk-siege-replay.json' : './assets/pk-motion-replay.json');
  if (!response.ok) throw new Error('无法读取混战动作预览');
  const frames = await response.json();
  const state = { world, paused: false, cursor: 0, elapsed: 0 };
  world.environment.setOptions({ time: 'noon', weather: 'clear' }); world.environment.frame(8);
  world.updateCamera = () => {
    world.focus = siege ? 25 : 0; world.camera.position.set(siege ? 25 : 0, siege ? 7 : 5.7, siege ? 22 : 18);
    world.camera.lookAt(siege ? 25 : 0, siege ? 2.8 : 1.6, 0);
  };
  function restart() {
    world.reset(); world.setSide(0); world.time = 0;
    state.cursor = 0; state.elapsed = 0;
  }
  function advance(dt) {
    state.elapsed += dt;
    if (state.elapsed > frames[frames.length - 1].t + .4) restart();
    while (state.cursor < frames.length && frames[state.cursor].t <= state.elapsed + .0001) {
      const frame = frames[state.cursor++]; world.sync(frame.soldiers, world.time, frame.t);
      frame.ev.forEach(event => {
        if (event.k === 'projectile') world.soldierProjectile(event);
        else if (event.k === 'volley') world.volley(event.sd, event.a || [], event.fly);
        else world.combatEvent(event);
      });
    }
    world.frame(dt);
  }
  state.advance = advance; state.restart = restart;
  window.__PK_PREVIEW = state;
  const controls = document.createElement('div'); controls.className = 'motion-controls';
  controls.innerHTML = '<span>部队接敌与混战预览</span><button type="button">暂停</button><button type="button">重新播放</button>';
  if (siege) controls.children[0].textContent = '远程兵攻城预览';
  document.body.appendChild(controls);
  controls.children[1].onclick = () => { state.paused = !state.paused; controls.children[1].textContent = state.paused ? '继续' : '暂停'; };
  controls.children[2].onclick = restart;
  restart(); let previous = performance.now();
  function loop(now) {
    const dt = Math.min(.1, (now - previous) / 1000); previous = now;
    if (!state.paused) advance(dt);
    requestAnimationFrame(loop);
  }
  window.__READY = true; requestAnimationFrame(loop);
}
