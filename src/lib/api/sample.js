const tf = (truth) => [
  { text: 'Prawda', correct: truth },
  { text: 'Fałsz', correct: !truth },
]

export const SAMPLE_QUIZ = {
  meta: {
    title: 'Rozgrzewka: wiedza ogólna',
    description: 'Sześć szybkich pytań na start lekcji — każdy typ pytania w jednym quizie.',
    cover: '🧠',
    tags: ['rozgrzewka', 'ogólne'],
    is_public: false,
  },
  questions: [
    { type: 'single', text: 'Ile nóg ma pająk?', time_limit: 20, points: 1000,
      answers: [{ text: '6', correct: false }, { text: '8', correct: true },
                { text: '10', correct: false }, { text: '12', correct: false }] },
    { type: 'truefalse', text: 'Wisła jest najdłuższą rzeką w Polsce.', time_limit: 10, points: 1000,
      answers: tf(true) },
    { type: 'multi', text: 'Które planety są gazowymi olbrzymami?', time_limit: 30, points: 2000,
      answers: [{ text: 'Jowisz', correct: true }, { text: 'Mars', correct: false },
                { text: 'Saturn', correct: true }, { text: 'Wenus', correct: false }] },
    { type: 'single', text: 'W którym roku Polska wstąpiła do Unii Europejskiej?', time_limit: 20, points: 1000,
      answers: [{ text: '1999', correct: false }, { text: '2004', correct: true },
                { text: '2007', correct: false }, { text: '1989', correct: false }] },
    { type: 'single', text: 'Jaki pierwiastek ma symbol O?', time_limit: 15, points: 1000,
      answers: [{ text: 'Złoto', correct: false }, { text: 'Tlen', correct: true },
                { text: 'Osm', correct: false }, { text: 'Ołów', correct: false }] },
    { type: 'truefalse', text: 'Światło ze Słońca leci do Ziemi około 8 minut.', time_limit: 10, points: 1000,
      answers: tf(true) },
  ],
}
