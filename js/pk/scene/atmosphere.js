import { SkyCycle } from './sky-cycle.js';
import { Weather } from './weather.js';

const HOURS = { dawn: 6.2, noon: 12, dusk: 18, night: 23 };
const WEATHER = { clear: '晴空', wind: '微风', rain: '细雨', snow: '飘雪', fog: '薄雾' };
const AUTO_WEATHER = ['clear', 'wind', 'rain', 'fog', 'clear', 'snow'];
export const TIME_MODES = ['auto', ...Object.keys(HOURS)];
export const WEATHER_MODES = ['auto', ...Object.keys(WEATHER)];

export class Atmosphere {
  constructor(world) {
    this.world = world;
    this.sky = new SkyCycle(world);
    this.weather = new Weather(world.scene);
    this.timeMode = 'auto'; this.weatherMode = 'auto';
    this.elapsed = 0; this.hour = 10; this.kind = 'clear';
    this.frame(0);
  }
  setOptions(options = {}) {
    if (TIME_MODES.includes(options.time)) this.timeMode = options.time;
    if (WEATHER_MODES.includes(options.weather)) this.weatherMode = options.weather;
  }
  frame(dt) {
    this.elapsed += dt;
    const target = this.timeMode === 'auto' ? (10 + this.elapsed / 15) % 24 : HOURS[this.timeMode];
    let delta = ((target - this.hour + 36) % 24) - 12;
    this.hour = (this.hour + delta * (1 - Math.exp(-dt * 1.6)) + 24) % 24;
    this.kind = this.weatherMode === 'auto' ? AUTO_WEATHER[Math.floor(this.elapsed / 90) % AUTO_WEATHER.length] : this.weatherMode;
    const haze = this.weather.frame(dt, this.elapsed, this.world.focus, this.kind);
    this.sky.frame(this.hour, haze.overcast, this.elapsed);
    this.world.scene.fog.near = 40 - haze.fog * 17;
    this.world.scene.fog.far = 112 - haze.fog * 45;
  }
  state() {
    const minute = Math.round(this.hour * 60) % 1440;
    const clock = String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    const icon = this.kind === 'rain' ? '☂' : this.kind === 'snow' ? '❄' : this.kind === 'fog' ? '≋' : this.hour < 6 || this.hour > 20 ? '☾' : '☀';
    return { time: this.timeMode, weather: this.weatherMode, hour: this.hour, kind: this.kind, clock, label: `${icon} ${clock} · ${WEATHER[this.kind]}` };
  }
}
