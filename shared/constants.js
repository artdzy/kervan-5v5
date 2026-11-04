// Ortak sabitler — hem sunucu (Node) hem istemci (tarayıcı) kullanır.

export const TICK_RATE = 30;      // sunucu simülasyon frekansı
export const SNAP_RATE = 20;      // durum paketi frekansı
export const TEAM_SIZE = 5;       // takım başına oyuncu (eksikler bot ile dolar)
export const INTERP_DELAY = 0.1;  // uzak oyuncu interpolasyon gecikmesi (sn)

export const TEAMS = ['att', 'def'];
export const TEAM_NAMES = { att: 'Saldırganlar', def: 'Savunanlar' };
export const TEAM_COLORS = { att: '#f0a640', def: '#5aa9f0' };

export const ROUND = {
  freeze: 5,       // donma süresi (satın alma, hareket yok)
  buy: 20,         // round başından itibaren satın alma süresi
  time: 115,       // round süresi
  bomb: 40,        // bomba sayacı
  plant: 3.2,      // kurma süresi
  defuse: 10,      // kitsiz imha süresi
  defuseKit: 5,    // kitli imha süresi
  end: 6,          // round sonu bekleme
  over: 12,        // maç sonu bekleme
  winRounds: 13,   // kazanmak için gereken round
  maxRounds: 24,
  half: 12,        // bu rounddan sonra takımlar yer değiştirir
};

export const ECON = {
  start: 800, max: 16000, win: 3250,
  lossBase: 1400, lossStep: 500, lossMax: 3400,
  plant: 300, plantedLossBonus: 800, defuse: 300,
};

export const PLAYER = {
  radius: 0.32,
  height: 1.8,
  crouchHeight: 1.25,
  eye: 1.62,
  crouchEye: 1.15,
  run: 5.6,
  walkMul: 0.52,
  crouchMul: 0.36,
  jump: 6.2,
  gravity: 16,
  accel: 8,
  airAccel: 2.2,
  airCap: 0.9,
  friction: 6,
  stopSpeed: 1.5,
  maxHp: 100,
};

// type: gun | melee | grenade | bomb
// rm = menzil çarpanı (her 10m'de hasar *= rm), pen = zırh delme oranı
export const WEAPONS = {
  knife:   { name: 'Bıçak',        slot: 3, type: 'melee', damage: 45, rate: 0.5, range: 2.2, price: 0, speed: 1.04, kill: 1500, pen: 0.85 },
  pistol:  { name: 'P9 Tabanca',   slot: 2, type: 'gun', damage: 30, rate: 0.15, mag: 15, reserve: 45, reload: 2.1, spread: 0.006, moveSpread: 0.035, airSpread: 0.12, recoil: 0.014, rm: 0.85, pen: 0.5, price: 200, speed: 0.98, kill: 300, auto: false, range: 150 },
  deagle:  { name: 'Magnum .50',   slot: 2, type: 'gun', damage: 55, rate: 0.36, mag: 7, reserve: 35, reload: 2.2, spread: 0.005, moveSpread: 0.07, airSpread: 0.2, recoil: 0.05, rm: 0.81, pen: 0.93, price: 700, speed: 0.96, kill: 300, auto: false, range: 200 },
  smg:     { name: 'SMG-9',        slot: 1, type: 'gun', damage: 26, rate: 0.075, mag: 30, reserve: 120, reload: 2.3, spread: 0.011, moveSpread: 0.022, airSpread: 0.1, recoil: 0.009, rm: 0.7, pen: 0.6, price: 1250, speed: 1.0, kill: 600, auto: true, range: 120 },
  shotgun: { name: 'Pompalı 12',   slot: 1, type: 'gun', damage: 20, pellets: 9, rate: 0.88, mag: 7, reserve: 32, reload: 2.8, spread: 0.06, moveSpread: 0.015, airSpread: 0.05, recoil: 0.06, rm: 0.45, pen: 0.5, price: 1200, speed: 0.92, kill: 900, auto: false, range: 40 },
  rifle:   { name: 'AK Taarruz',   slot: 1, type: 'gun', damage: 36, rate: 0.1, mag: 30, reserve: 90, reload: 2.5, spread: 0.004, moveSpread: 0.09, airSpread: 0.25, recoil: 0.016, rm: 0.98, pen: 0.77, price: 2700, speed: 0.86, kill: 300, auto: true, range: 250 },
  carbine: { name: 'M4 Karabina',  slot: 1, type: 'gun', damage: 33, rate: 0.09, mag: 30, reserve: 90, reload: 3.1, spread: 0.003, moveSpread: 0.08, airSpread: 0.25, recoil: 0.013, rm: 0.97, pen: 0.7, price: 3100, speed: 0.9, kill: 300, auto: true, range: 250 },
  sniper:  { name: 'Keskin .338',  slot: 1, type: 'gun', damage: 115, rate: 1.45, mag: 5, reserve: 30, reload: 3.6, spread: 0.08, scopedSpread: 0.0004, moveSpread: 0.25, airSpread: 0.4, recoil: 0.08, rm: 0.99, pen: 0.97, price: 4750, speed: 0.8, kill: 100, auto: false, range: 400, scope: true },
  grenade: { name: 'El Bombası',   slot: 4, type: 'grenade', price: 300, speed: 1.0, kill: 300, pen: 0.6 },
  bomb:    { name: 'C4',           slot: 5, type: 'bomb', speed: 1.0 },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);

export const EQUIP = {
  kevlar: { name: 'Kevlar Yelek', price: 650 },
  helmet: { name: 'Yelek + Kask', price: 1000 },
  kit:    { name: 'İmha Kiti', price: 400, team: 'def' },
};

export const BUY_MENU = [
  { title: 'Tabancalar', items: ['pistol', 'deagle'] },
  { title: 'Hafif', items: ['smg', 'shotgun'] },
  { title: 'Tüfekler', items: ['rifle', 'carbine', 'sniper'] },
  { title: 'Ekipman', items: ['kevlar', 'helmet', 'kit', 'grenade'] },
];

export const GRENADE = { fuse: 1.6, radius: 8.5, damage: 100, gravity: 15, throwSpeed: 15 };
export const BOMB = { radius: 26, damage: 380 };
export const BUY_RADIUS = 14;
