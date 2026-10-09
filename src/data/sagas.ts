export interface Saga {
  id: string;
  title: string;
  description: string;
  backdrop_path: string;
  movies: number[]; // TMDB Movie IDs in chronological order
}

export const sagas: Saga[] = [
  {
    id: 'harry-potter',
    title: 'Harry Potter',
    description: 'Acompanhe a jornada do menino que sobreviveu, desde seu primeiro ano em Hogwarts até a batalha final contra Lord Voldemort.',
    backdrop_path: '/hziiv14OpD73u9gAak4XDDfBKa2.jpg',
    movies: [671, 672, 673, 674, 675, 767, 12444, 12445]
  },
  {
    id: 'terminator',
    title: 'O Exterminador do Futuro',
    description: 'A batalha pela sobrevivência da humanidade contra as máquinas da Skynet através de viagens no tempo.',
    backdrop_path: '/g4a5YLWiw6HWKQGhpMexDptGOWm.jpg',
    movies: [218, 280, 534, 533, 87101, 290859]
  },
  {
    id: 'lord-of-the-rings',
    title: 'O Senhor dos Anéis',
    description: 'A épica jornada da Sociedade do Anel para destruir o Um Anel e derrotar o Senhor Sombrio Sauron.',
    backdrop_path: '/mgn5nQnOExF4A1g7eW6PndrXG13.jpg',
    movies: [120, 121, 122]
  },
  {
    id: 'star-wars',
    title: 'Star Wars: Saga Skywalker',
    description: 'A épica ópera espacial que narra a jornada da família Skywalker em uma galáxia muito, muito distante.',
    backdrop_path: '/ej1O7E3YfX6Qh9YIfkP7c3U4j9V.jpg',
    movies: [1893, 1894, 1895, 11, 181, 189, 140607, 181808, 181812]
  },
  {
    id: 'twilight',
    title: 'A Saga Crepúsculo',
    description: 'O romance épico entre a humana Bella Swan e o vampiro Edward Cullen, que desafia as leis de seus mundos.',
    backdrop_path: '/3pTWx7dlsyW77YhIeU5yZcTj7T6.jpg',
    movies: [8966, 18239, 24021, 50619, 82992]
  },
  {
    id: 'hunger-games',
    title: 'Jogos Vorazes',
    description: 'Katniss Everdeen se voluntaria para o torneio mortal e acaba se tornando o símbolo de uma revolução contra a Capital.',
    backdrop_path: '/cEHqQ1NnsbZzHIfyV9Y4y6J68bM.jpg',
    movies: [70160, 101299, 131631, 131634, 695721]
  },
  {
    id: 'matrix',
    title: 'The Matrix',
    description: 'Neo descobre a verdade chocante sobre a realidade e se junta à rebelião para libertar a humanidade das máquinas.',
    backdrop_path: '/lUXR2iF4D9Tf0bM84k1z4pC5W9i.jpg',
    movies: [603, 604, 605, 624860]
  },
  {
    id: 'pirates',
    title: 'Piratas do Caribe',
    description: 'As aventuras do excêntrico Capitão Jack Sparrow em alto mar, enfrentando lendas e maldições.',
    backdrop_path: '/k5nB2RlszXk7UquhGkE2fS3B39i.jpg',
    movies: [22, 58, 285, 1865, 166426]
  }
];
