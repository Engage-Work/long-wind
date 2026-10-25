// 第一章 · 长风 — the golden steppe at the hour before sunset (the original game). Everything here is the default
// layout/terrain/biome (world/layout.js); only the waves and the environment are spelled out.
export default {
  id: 'steppe', no: 'Chapter I', title: 'The Long Wind', short: 'Steppe',
  env: { mood: 'golden', drift: true, wind: 1.0 },
  waves: [
    { title: 'The Wind Rises', enemies: ['bandit', 'bandit', 'bandit'], wind: 1.0, mood: 'golden', maxAttackers: 1 },
    { title: 'The Grass Stirs', enemies: ['bandit', 'spearman', 'bandit', 'archer', 'bandit'], wind: 1.2, maxAttackers: 2 },
    { title: 'A Forest of Spears', enemies: ['shieldman', 'spearman', 'archer', 'shieldman', 'bandit_heavy', 'archer'], wind: 1.35, maxAttackers: 2 },
    { title: 'The Sword Sings', enemies: ['swordmaster'], wind: 1.5, windPhase2: 2.2, mood: 'ember', moodSeconds: 20, boss: true, maxAttackers: 1 },
  ],
  next: 'bamboo',
};
