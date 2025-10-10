/**
 * Guest name generator - creates funny random usernames for guest players
 * Format: [adjective][animal][number]
 */

const adjectives = [
  'Dancing', 'Flying', 'Sneaky', 'Mighty', 'Sleepy', 'Crazy', 'Happy', 'Grumpy',
  'Jolly', 'Fuzzy', 'Sparkly', 'Bouncing', 'Spinning', 'Zooming', 'Giggling',
  'Snoring', 'Jumping', 'Racing', 'Floating', 'Dashing', 'Clever', 'Silly',
  'Brave', 'Swift', 'Gentle', 'Fierce', 'Nimble', 'Bold', 'Quirky', 'Witty',
  'Fencing', 'Boxing', 'Juggling', 'Surfing', 'Skating', 'Skiing', 'Diving'
];

const animals = [
  'Monkey', 'Panda', 'Tiger', 'Dragon', 'Phoenix', 'Unicorn', 'Penguin', 'Koala',
  'Dolphin', 'Eagle', 'Wolf', 'Fox', 'Bear', 'Rabbit', 'Otter', 'Raccoon',
  'Squirrel', 'Hedgehog', 'Hamster', 'Owl', 'Flamingo', 'Parrot', 'Gecko',
  'Platypus', 'Narwhal', 'Walrus', 'Sloth', 'Alpaca', 'Llama', 'Chinchilla',
  'Axolotl', 'Capybara', 'Quokka', 'Pangolin', 'Meerkat', 'Lemur'
];

/**
 * Generate a unique guest username
 * @returns {string} Random guest name like "FencingMonkey124"
 */
export function generateGuestName() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(Math.random() * 900) + 100; // 100-999

  return `${adjective}${animal}${number}`;
}

/**
 * Generate a unique guest user ID
 * @returns {string} Unique guest ID with timestamp and random component
 */
export function generateGuestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `guest_${timestamp}_${random}`;
}
