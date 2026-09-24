export interface VerdictQuote {
  badge: string;
  quote: string;
  subtext: string;
}

const SUPER_FAST_CORRECT: VerdictQuote[] = [
  {
    badge: '⚡ Speed Demon',
    quote: 'Einstein ke chacha ho kya bhai?!',
    subtext: 'Insane speed + maximum bonus points unlocked! 🚀',
  },
  {
    badge: '🏎️ Formula 1',
    quote: 'Itni jaldi toh Swiggy bhi deliver nahi karta!',
    subtext: 'Blink and you missed it! Top-tier reflexes. 💨',
  },
  {
    badge: '🧠 Big Brain Energy',
    quote: 'Class topper alert! Dimag 5G se bhi tez!',
    subtext: 'Lightning fast and razor sharp. 🔥',
  },
  {
    badge: '🚀 Rocket Launch',
    quote: 'Sawāl aate hi dhuan nikaal diya!',
    subtext: 'Pure god-level reflexes! +Speed bonus locked. ✨',
  },
  {
    badge: '⚡ Khatarnaak Reflexes',
    quote: 'Palke jhapakte hi lock in kar diya!',
    subtext: 'Maximum speed points in your pocket! 💰',
  },
  {
    badge: '🔥 God-Level Speed',
    quote: 'Are bhai bhai bhai! Itni tez calculation?!',
    subtext: 'Direct to the moon! Outstanding speed. 🌙',
  },
];

const REGULAR_CORRECT: VerdictQuote[] = [
  {
    badge: '🎯 Sahi Jawab',
    quote: '7 Crore (in points) aapke account mein!',
    subtext: 'Bilkul correct answer! Keep the streak rolling. 🏆',
  },
  {
    badge: '👑 Mauj Kardi',
    quote: 'Wah bete wah! Full marks vibes chal rahi hain!',
    subtext: 'Clean hit! Points added to your total. 💯',
  },
  {
    badge: '🌟 Sahi Pakde Hain',
    quote: 'Shabash champion! Teer seedha nishane pe!',
    subtext: 'Spot-on logic. You nailed this one! ✨',
  },
  {
    badge: '🔥 Guru Ho Ja Shuru',
    quote: 'Confidence 100%, Accuracy 100%!',
    subtext: 'Leaderboard pe aage badhne ka time! 📈',
  },
  {
    badge: '🦁 Sher Aya',
    quote: 'Dhamakedar answer! Kya baat hai!',
    subtext: 'Perfect score for this question! 🍕',
  },
  {
    badge: '🎩 Classy Move',
    quote: 'Mastermind at work! Bilkul sahi pakda!',
    subtext: '10/10 Brain cells working in full sync! 🧠',
  },
  {
    badge: '🍕 Treat Banti Hai',
    quote: 'Sahi answer deke din bana diya!',
    subtext: 'Solid answer! Next question pe bhi aag lagao. 🔥',
  },
];

const WRONG_QUOTES: VerdictQuote[] = [
  {
    badge: '🧠 Brain 404',
    quote: 'Answer Not Found! System hang ho gaya kya?',
    subtext: 'Koi baat nahi, agle question me comeback pakka hai! 🔋',
  },
  {
    badge: '🙃 Aayein?!',
    quote: 'Baigan answer de diya bhai!',
    subtext: 'Option thoda idhar udhar nikal gaya, agla apna hai! 🍆',
  },
  {
    badge: '🤦‍♂️ Dil Se Bura Laga',
    quote: 'Yeh kya kar diya yaar? Kismat ne dhoka de diya!',
    subtext: 'Don’t worry! Champions bounce back stronger. 🦁',
  },
  {
    badge: '💀 Tukka Fail',
    quote: 'Tukka hawa me gayab ho gaya!',
    subtext: 'Next question me full focus se maaro sixer! 🏏',
  },
  {
    badge: '📉 Moye Moye',
    quote: 'Chhoti si mistake, par seekh badi mili!',
    subtext: 'Comeback is always greater than setback! Let’s go! 🦾',
  },
  {
    badge: '😂 Kehna Kya Chahte Ho?',
    quote: 'Option galat tick ho gaya boss!',
    subtext: 'Thoda chai-pani peeyo aur agle pe phodo! ☕',
  },
  {
    badge: '🚀 Out of Orbit',
    quote: 'Answer galaxy chhod ke nikal gaya!',
    subtext: 'Target thoda miss hua, spirit abhi bhi 100% hai! 🎯',
  },
  {
    badge: '🙈 Galti Se Mistake',
    quote: 'Bade bade quizzes mein aisi choti baatein hoti rehti hain!',
    subtext: 'Agla question abhi baaki hai, dhoom machao! ⚡',
  },
  {
    badge: '👀 Gemini Shocked',
    quote: 'Google AI bhi dekh ke soch me pad gaya!',
    subtext: 'Next round me score double karenge! 💪',
  },
];

const POLL_QUOTES: VerdictQuote[] = [
  {
    badge: '🎙️ Loktantra Ki Jeet',
    quote: 'Aapka vote safal hua!',
    subtext: 'Classroom ke opinion me aapka count ho gaya! 🗳️',
  },
  {
    badge: '💡 Seedha Dil Se',
    quote: 'Thought recorded! Room’s voice matters!',
    subtext: 'Dekhte hain baaki room kya sochta hai. 👀',
  },
  {
    badge: '✨ Great Perspective',
    quote: 'Aapka jawab screen pe chha gaya!',
    subtext: 'Watch the live distribution on the big screen! 📊',
  },
];

/**
 * Returns a memorable Hinglish / English verdict quote based on accuracy and speed.
 */
export function getVerdictQuote(
  isCorrect: boolean,
  isSpeedy: boolean,
  questionIndex: number,
  isPoll = false
): VerdictQuote {
  if (isPoll) {
    return POLL_QUOTES[questionIndex % POLL_QUOTES.length];
  }

  if (isCorrect) {
    if (isSpeedy) {
      return SUPER_FAST_CORRECT[questionIndex % SUPER_FAST_CORRECT.length];
    }
    return REGULAR_CORRECT[questionIndex % REGULAR_CORRECT.length];
  }

  return WRONG_QUOTES[questionIndex % WRONG_QUOTES.length];
}
