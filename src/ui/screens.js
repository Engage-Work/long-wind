// HUD markup and words: title, wave names, controls, pause, and the poems for victory and defeat.
// Poems are classical and public domain: 李白《侠客行》 (victory) and 《易水歌》 (defeat). They stay as brush-written
// columns (decoration, like the 长风 logo) with the English translation set beneath.
// Owner: UI (U).

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const numeral = (n) => ROMAN[n] || String(n);

// Default names per wave (used when the director's title is missing).
export const WAVES = [
  { tt: 'The Wind Rises' },
  { tt: 'The Grass Stirs' },
  { tt: 'The Sword Sings' },
  { tt: 'The Clouds Part' },
  { tt: 'The Geese Return' },
];
export const BOSS_WAVE = { tt: 'The Long Wind' };

// Default boss names by enemy kind (director may send its own via enemy:spawn {name, sub}).
export const BOSS_NAMES = {
  swordmaster: { name: 'The Broken Blade', sub: 'Swordmaster' },
  boss: { name: 'The Broken Blade', sub: 'Swordmaster' },
  bandit_heavy: { name: 'Mountain-Breaker', sub: 'Bandit Chief' },
  assassin: { name: 'The Night Owl', sub: 'Assassin of the Rain' },
};

export const CONTROLS = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['LMB', 'Strike'],
  ['Hold LMB', 'Heavy strike'],
  ['RMB', 'Block · parry on impact'],
  ['Space', 'Dodge'],
  ['Shift', 'Sprint'],
  ['Q · Tab', 'Lock on'],
  ['E', 'Sword qi'],
  ['F', 'Draw · sheathe'],
  ['Esc', 'Pause'],
];
// The in-game hint shows only the essentials.
export const HINT = [0, 2, 4, 5, 7, 8];

/** `<kbd>key</kbd><span>action</span>` pairs, shared by the keyboard list here and the touch lists in touch.js. */
export const controlRows = (list) => list.map(([k, action]) => `<kbd>${k}</kbd><span>${action}</span>`).join('');

export const VICTORY = {
  lines: ['十步杀一人', '千里不留行', '事了拂衣去', '深藏身与名'],
  en: 'Ten paces, and a man falls; a thousand miles, and no trace is left.<br>The deed done, he shakes out his sleeves and goes, his name and self buried deep.',
  src: 'Li Bai · Ballad of the Wandering Knight',
  go: 'Ride on',
};
export const DEFEAT = {
  lines: ['风萧萧兮易水寒', '壮士一去兮不复还'],
  en: 'The wind sighs, and the waters of the Yi run cold;<br>the warrior departs, and does not return.',
  src: 'Song of the Yi River',
  go: 'Rise again',
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const FILTERS = `
<svg class="defs" aria-hidden="true" focusable="false"><defs>
  <filter id="wx-ink" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="4" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="wx-ink-live" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="3" seed="7" result="n">
      <animate attributeName="baseFrequency" dur="18s" values="0.026;0.034;0.026" repeatCount="indefinite"/>
    </feTurbulence>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="0.35"/>
  </filter>
</defs></svg>`;

export const HUD_HTML = `
${FILTERS}
<div class="lyr marks"></div>
<div class="lyr fxl"></div>
<div class="edge"></div>
<div class="qi"></div>
<div class="play vitals">
  <div class="focus"><div class="wash"></div><div class="rt m"></div><div class="r m"></div><div class="pulse m"></div><div class="g">Qi</div></div>
  <div class="health"><div class="tr m"></div><div class="gh m"></div><div class="fl m"></div></div>
</div>
<div class="play boss"><div class="nm"></div><div class="sb"></div>
  <div class="bar"><div class="tr m"></div><div class="gh m"></div><div class="fl m"></div></div>
  <div class="po"><div class="a m"></div><div class="b m"></div></div>
</div>
<div class="ret"><div class="e m"></div><div class="d"></div></div>
<div class="banner"><div class="wash"></div><div class="no"></div><div class="tt"></div><div class="ru m"></div><div class="en"></div><img class="seal" alt=""></div>
<div class="hint">${controlRows(HINT.map((i) => CONTROLS[i]))}</div>

<div class="scr title">
  <div class="shade"></div>
  <div class="col"><div class="tt">长风</div><img class="seal" alt=""></div>
  <div class="en"><b>LONG WIND</b><i>the wind arrives before the blade</i><u class="ed">Engage Edition</u></div>
  <div class="go"><div class="ln m"></div><div class="t"><b>Click to begin</b></div><div class="ln r m"></div></div>
</div>

<div class="scr pause">
  <div class="shade"></div>
  <div class="pn">
    <div class="hd">Paused</div>
    <div class="mn">
      <button data-act="resume"><b>Resume</b></button>
      <button data-act="restart"><b>Restart</b></button>
      <button data-act="controls"><b>Controls</b></button>
      <div class="vol"><b>Volume</b><div class="sl"><div class="tr m"></div><div class="fl m"></div></div></div>
      <div class="qual"><b>Quality</b><span class="qo" data-q="low">Smooth</span><span class="qo" data-q="med">Balanced</span><span class="qo" data-q="high">Ultra</span></div>
      <div class="ctl">${controlRows(CONTROLS)}</div>
    </div>
  </div>
  <div class="ft">the grass waits · the wind does not</div>
</div>

<div class="scr end victory">
  <div class="shade"></div>
  <div class="st"></div>
  <div class="body"></div>
  <div class="tr"></div>
  <div class="go" data-act="restart"></div>
</div>
<div class="scr end defeat">
  <div class="shade"></div>
  <div class="body"></div>
  <div class="tr"></div>
  <div class="go" data-act="restart"></div>
</div>`;

/** Fill an ending screen with its poem: brush-written vertical columns (right-to-left) with the English beneath. */
export function fillEnding(root, poem, sealUrl) {
  const body = root.querySelector('.body');
  body.innerHTML = poem.lines.map((l, i) => `<div class="ln${i >= 2 ? ' sm' : ''}" style="--i:${i}">${esc(l)}</div>`).join('') +
    (sealUrl ? `<img class="seal" src="${sealUrl}" alt="">` : '');
  root.querySelector('.tr').innerHTML = `${poem.en}<small>${esc(poem.src)}</small>`;
  root.querySelector('.go').innerHTML = `<b>${esc(poem.go)}</b>`;
}

export { esc };
