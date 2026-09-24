/**
 * Unified, vibrant avatars inspired by Marvel, Anime, Superheroes, Gaming & Pop culture.
 * Deterministic per name hash so students have the same cool mascot across their phone,
 * lobby, leaderboard, and podium.
 */
export const AVATARS = [
  '🥷', // Naruto / Ninja
  '🕷️', // Spider-Man
  '🦾', // Iron Man / Cyborg
  '⚡', // Thor / Flash / Pikachu
  '🛡️', // Captain America
  '🐉', // Goku / Shenron / Dragon
  '⚔️', // Zoro / Demon Slayer
  '🦊', // Kurama / Nine-Tails Fox
  '👑', // Luffy / Pirate King
  '🤖', // Transformer / Mecha
  '🧙‍♂️', // Doctor Strange / Wizard
  '🦇', // Batman
  '🦁', // Black Panther / Lion King
  '🚀', // Rocket Raccoon / Astronaut
  '👾', // Space Invader / Pixel Gamer
  '🦄', // Unicorn
  '🐼', // Kung Fu Panda
  '🐯', // Tiger
  '🍕', // Pizza Lover
  '🍔', // Burger Boss
  '👻', // Gengar / Ghost
  '🛸', // UFO / Alien
  '🎯', // Hawkeye / Bullseye
  '🕶️', // Gojo / Cool Shades
  '🥊', // Saitama / One Punch Man
  '🦖', // T-Rex / Godzilla
  '🐵', // Monkey King / Sun Wukong
  '🎩', // Detective / Gentleman
  '🌟', // Super Star
  '🔥', // Fire Master
];

export function getAvatar(name: string): string {
  if (!name) return '🎓';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATARS[Math.abs(hash) % AVATARS.length] ?? '🎓';
}
