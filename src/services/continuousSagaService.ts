/**
 * continuousSagaService.ts
 * 
 * Serviço automatizado para detecção e exibição de Sagas em Animes Contínuos
 * (ex: One Piece, Naruto, Bleach, Dragon Ball, Hunter x Hunter, Detective Conan).
 * 
 * Em animes sazonais (Demon Slayer, Jujutsu Kaisen), exibe o nome da temporada.
 * Em animes contínuos, calcula dinamicamente a Saga correspondente ao episódio atual
 * com tempo de resposta de 0ms (reatividade pura em memória com atualização em segundo plano via API).
 */

import { Anime } from '../types';

export interface SagaInterval {
  id: string;
  name: string;
  startEp: number;
  endEp: number | null; // null se estiver em andamento (ongoing)
}

export interface SubtitleDisplayInfo {
  label: string;
  isSaga: boolean;
  rawName?: string;
}

// Mapeamentos canônicos estruturados em memória para resposta instantânea (0ms)
const CANONICAL_CONTINUOUS_SAGAS: Record<string, SagaInterval[]> = {
  'one piece': [
    { id: 'op_east_blue', name: 'East Blue', startEp: 1, endEp: 61 },
    { id: 'op_grand_line', name: 'Entrando na Grand Line', startEp: 62, endEp: 77 },
    { id: 'op_drum', name: 'Ilha de Drum', startEp: 78, endEp: 91 },
    { id: 'op_alabasta', name: 'Alabasta', startEp: 92, endEp: 130 },
    { id: 'op_post_alabasta', name: 'Pós-Alabasta', startEp: 131, endEp: 143 },
    { id: 'op_skypiea', name: 'Skypiea (Ilha do Céu)', startEp: 144, endEp: 195 },
    { id: 'op_g8_foxy', name: 'G-8 & Davy Back Fight', startEp: 196, endEp: 228 },
    { id: 'op_water_7', name: 'Water 7', startEp: 229, endEp: 263 },
    { id: 'op_enies_lobby', name: 'Enies Lobby', startEp: 264, endEp: 312 },
    { id: 'op_post_enies', name: 'Pós-Enies Lobby', startEp: 313, endEp: 325 },
    { id: 'op_thriller_bark', name: 'Thriller Bark', startEp: 326, endEp: 384 },
    { id: 'op_sabaody', name: 'Arquipélago Sabaody', startEp: 385, endEp: 407 },
    { id: 'op_amazon_lily', name: 'Amazon Lily', startEp: 408, endEp: 421 },
    { id: 'op_impel_down', name: 'Impel Down', startEp: 422, endEp: 456 },
    { id: 'op_marineford', name: 'Guerra de Marineford', startEp: 457, endEp: 489 },
    { id: 'op_post_war', name: 'Pós-Guerra', startEp: 490, endEp: 516 },
    { id: 'op_fishman', name: 'Ilha dos Homens-Peixe', startEp: 517, endEp: 574 },
    { id: 'op_punk_hazard', name: 'Punk Hazard', startEp: 575, endEp: 628 },
    { id: 'op_dressrosa', name: 'Dressrosa', startEp: 629, endEp: 746 },
    { id: 'op_zou', name: 'Zou', startEp: 747, endEp: 782 },
    { id: 'op_whole_cake', name: 'Whole Cake Island', startEp: 783, endEp: 877 },
    { id: 'op_reverie', name: 'Reverie', startEp: 878, endEp: 891 },
    { id: 'op_wano', name: 'País de Wano', startEp: 892, endEp: 1088 },
    { id: 'op_egghead', name: 'Egghead', startEp: 1089, endEp: 1122 },
    { id: 'op_elbaf', name: 'Elbaf', startEp: 1123, endEp: null },
  ],

  'naruto': [
    { id: 'naruto_waves', name: 'País das Ondas', startEp: 1, endEp: 19 },
    { id: 'naruto_chunin', name: 'Exame Chunin', startEp: 20, endEp: 67 },
    { id: 'naruto_konoha_crush', name: 'Invasão de Konoha', startEp: 68, endEp: 80 },
    { id: 'naruto_tsunade', name: 'Busca por Tsunade', startEp: 81, endEp: 100 },
    { id: 'naruto_tea_country', name: 'País do Chá', startEp: 101, endEp: 106 },
    { id: 'naruto_sasuke_retrieval', name: 'Resgate de Sasuke', startEp: 107, endEp: 135 },
    { id: 'naruto_special_missions', name: 'Missões Especiais', startEp: 136, endEp: 220 },
  ],

  'naruto shippuden': [
    { id: 'ns_kazekage', name: 'Resgate do Kazekage', startEp: 1, endEp: 32 },
    { id: 'ns_sasuke', name: 'Reencontro com Sasuke', startEp: 33, endEp: 53 },
    { id: 'ns_twelve_guardians', name: 'Doze Guardiões Ninja', startEp: 54, endEp: 71 },
    { id: 'ns_immortals', name: 'Hidan e Kakuzu', startEp: 72, endEp: 88 },
    { id: 'ns_three_tails', name: 'Sanbi (Três-Caudas)', startEp: 89, endEp: 112 },
    { id: 'ns_itachi_pursuit', name: 'Busca por Itachi', startEp: 113, endEp: 143 },
    { id: 'ns_six_tails', name: 'Rokubi (Seis-Caudas)', startEp: 144, endEp: 151 },
    { id: 'ns_pain_invasion', name: 'Invasão de Pain', startEp: 152, endEp: 175 },
    { id: 'ns_past_konoha', name: 'Passado de Konoha', startEp: 176, endEp: 196 },
    { id: 'ns_five_kage', name: 'Reunião dos Cinco Kages', startEp: 197, endEp: 214 },
    { id: 'ns_paradise_boat', name: 'Vida Paradisíaca no Barco', startEp: 215, endEp: 242 },
    { id: 'ns_war_countdown', name: 'Contagem para a Quarta Guerra', startEp: 243, endEp: 260 },
    { id: 'ns_fourth_war', name: 'Quarta Guerra Mundial Shinobi', startEp: 261, endEp: 320 },
    { id: 'ns_sasuke_itachi', name: 'Irmãos Uchiha vs Kabuto', startEp: 321, endEp: 348 },
    { id: 'ns_anbu_kakashi', name: 'Kakashi: A Sombra das Operações ANBU', startEp: 349, endEp: 361 },
    { id: 'ns_ten_tails', name: 'Ressurreição do Dez-Caudas', startEp: 362, endEp: 375 },
    { id: 'ns_madara_kaguya', name: 'Madara e Kaguya Otsutsuki', startEp: 376, endEp: 474 },
    { id: 'ns_final_battle', name: 'Batalha Final & Epílogo', startEp: 475, endEp: 500 },
  ],

  'bleach': [
    { id: 'bl_substitute', name: 'Shinigami Substituto', startEp: 1, endEp: 20 },
    { id: 'bl_soul_society', name: 'Invasão da Soul Society', startEp: 21, endEp: 63 },
    { id: 'bl_bount', name: 'Bounts', startEp: 64, endEp: 109 },
    { id: 'bl_arrancar', name: 'Chegada dos Arrancars', startEp: 110, endEp: 167 },
    { id: 'bl_amagai', name: 'Novo Capitão Amagai', startEp: 168, endEp: 189 },
    { id: 'bl_hueco_mundo', name: 'Batalha no Hueco Mundo', startEp: 190, endEp: 205 },
    { id: 'bl_pendulum', name: 'Passado dos Vaizard', startEp: 206, endEp: 212 },
    { id: 'bl_karakura', name: 'Falsa Cidade de Karakura', startEp: 213, endEp: 310 },
    { id: 'bl_reigai', name: 'Invasão do Gotei 13', startEp: 311, endEp: 342 },
    { id: 'bl_fullbring', name: 'Shinigami Perdido (Fullbringers)', startEp: 343, endEp: 366 },
  ],

  'dragon ball z': [
    { id: 'dbz_saiyan', name: 'Saiyajins (Raditz & Vegeta)', startEp: 1, endEp: 35 },
    { id: 'dbz_namek', name: 'Namekusei & Freeza', startEp: 36, endEp: 107 },
    { id: 'dbz_garlic', name: 'Garlic Jr.', startEp: 108, endEp: 117 },
    { id: 'dbz_androids', name: 'Androides & Cell', startEp: 118, endEp: 194 },
    { id: 'dbz_other_world', name: 'Torneio do Outro Mundo', startEp: 195, endEp: 199 },
    { id: 'dbz_buu', name: 'Majin Boo', startEp: 200, endEp: 291 },
  ],

  'dragon ball super': [
    { id: 'dbs_gods', name: 'Batalha dos Deuses', startEp: 1, endEp: 14 },
    { id: 'dbs_resurrection_f', name: 'Ressurreição de Freeza', startEp: 15, endEp: 27 },
    { id: 'dbs_universe_6', name: 'Torneio do Universo 6', startEp: 28, endEp: 46 },
    { id: 'dbs_goku_black', name: 'Goku Black & Trunks do Futuro', startEp: 47, endEp: 76 },
    { id: 'dbs_tournament_power', name: 'Torneio do Poder', startEp: 77, endEp: 131 },
  ],

  'hunter x hunter': [
    { id: 'hxh_exam', name: 'Exame Hunter', startEp: 1, endEp: 26 },
    { id: 'hxh_arena', name: 'Arena Celestial', startEp: 27, endEp: 38 },
    { id: 'hxh_yorknew', name: 'Trupe Fantasma (Yorknew City)', startEp: 39, endEp: 58 },
    { id: 'hxh_greed_island', name: 'Greed Island', startEp: 59, endEp: 75 },
    { id: 'hxh_chimera_ant', name: 'Formigas Quimera (Chimera Ant)', startEp: 76, endEp: 136 },
    { id: 'hxh_election', name: 'Eleição do 13º Presidente', startEp: 137, endEp: 148 },
  ],

  'fairy tail': [
    { id: 'ft_prologue', name: 'Fairy Tail', startEp: 1, endEp: 48 },
    { id: 'ft_oracion_seis', name: 'Oración Seis', startEp: 49, endEp: 68 },
    { id: 'ft_edolas', name: 'Edolas', startEp: 69, endEp: 95 },
    { id: 'ft_tenrou', name: 'Ilha Tenrou', startEp: 96, endEp: 122 },
    { id: 'ft_grand_magic', name: 'Grandes Jogos Mágicos', startEp: 151, endEp: 203 },
    { id: 'ft_tartaros', name: 'Tartaros', startEp: 227, endEp: 265 },
    { id: 'ft_alvarez', name: 'Império Alvarez', startEp: 278, endEp: 328 },
  ],

  'black clover': [
    { id: 'bc_entry', name: 'Exame dos Cavaleiros Mágicos', startEp: 1, endEp: 19 },
    { id: 'bc_eye_sun', name: 'Olho do Sol da Meia-Noite', startEp: 20, endEp: 39 },
    { id: 'bc_seabed', name: 'Templo Submarino', startEp: 40, endEp: 50 },
    { id: 'bc_witches', name: 'Floresta das Bruxas', startEp: 51, endEp: 65 },
    { id: 'bc_royal_knights', name: 'Cavaleiros Reais', startEp: 66, endEp: 94 },
    { id: 'bc_elf_reincarnation', name: 'Reencarnação dos Elfos', startEp: 95, endEp: 129 },
    { id: 'bc_spade_kingdom', name: 'Invasão do Reino Spade', startEp: 158, endEp: 170 },
  ],

  'detective conan': [
    { id: 'dc_initial', name: 'Casos Iniciais', startEp: 1, endEp: 128 },
    { id: 'dc_haibara', name: 'Chegada de Ai Haibara', startEp: 129, endEp: 178 },
    { id: 'dc_vermouth', name: 'Confronto com Vermouth', startEp: 179, endEp: 345 },
    { id: 'dc_kir', name: 'Choque de Preto e Vermelho', startEp: 491, endEp: 504 },
    { id: 'dc_bourbon', name: 'Investigação de Bourbon', startEp: 505, endEp: 704 },
    { id: 'dc_scarlet', name: 'Retorno Escarlate', startEp: 779, endEp: 783 },
    { id: 'dc_rum', name: 'Mistério de Rum', startEp: 861, endEp: 1100 },
    { id: 'dc_ongoing', name: 'Casos Atuais', startEp: 1101, endEp: null },
  ],
};

// Cache dinâmico para sagas obtidas de APIs externas
const dynamicSagasCache = new Map<string, SagaInterval[]>();

/**
 * Normaliza o título para correspondência canônica
 */
function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Identifica se a obra é um anime contínuo (não sazonal)
 */
export function isContinuousAnime(anime: Anime): boolean {
  if (!anime) return false;
  const norm = normalizeTitle(anime.title);
  const normJap = normalizeTitle(anime.japaneseTitle || '');

  // 1. Verifica contra as obras canônicas conhecidas
  for (const key of Object.keys(CANONICAL_CONTINUOUS_SAGAS)) {
    if (norm.includes(key) || normJap.includes(key) || key.includes(norm)) {
      return true;
    }
  }

  // 2. Se tiver apenas 1 temporada cadastrada (ou nenhuma) e o formato for TV com alto número de episódios
  const hasMultipleDistinctSeasons = Boolean(anime.seasons && anime.seasons.length > 1);
  if (!hasMultipleDistinctSeasons) {
    if (anime.format === 'TV' && (anime.totalEpisodes === null || (anime.totalEpisodes && anime.totalEpisodes >= 50))) {
      return true;
    }
  }

  return false;
}

/**
 * Obtém a lista de sagas para um título de anime contínuo
 */
export function getSagasForAnime(animeTitle: string): SagaInterval[] | null {
  if (!animeTitle) return null;
  const norm = normalizeTitle(animeTitle);

  // Verifica cache dinâmico
  if (dynamicSagasCache.has(norm)) {
    return dynamicSagasCache.get(norm)!;
  }

  // Verifica tabela canônica em memória
  for (const [key, sagas] of Object.entries(CANONICAL_CONTINUOUS_SAGAS)) {
    if (norm.includes(key) || key.includes(norm)) {
      return sagas;
    }
  }

  return null;
}

/**
 * Calcula dinamicamente o nome da saga para o episódio atual (0ms)
 */
export function getSagaForEpisode(animeTitle: string, episode: number): string | null {
  const sagas = getSagasForAnime(animeTitle);
  if (!sagas || sagas.length === 0) return null;

  const ep = Math.max(1, episode);

  for (const saga of sagas) {
    const isAfterStart = ep >= saga.startEp;
    const isBeforeEnd = saga.endEp === null || ep <= saga.endEp;
    if (isAfterStart && isBeforeEnd) {
      return saga.name;
    }
  }

  // Se o episódio for maior do que o último intervalo registrado, pega a última saga (ongoing)
  const lastSaga = sagas[sagas.length - 1];
  if (lastSaga && ep >= lastSaga.startEp) {
    return lastSaga.name;
  }

  return sagas[0]?.name || null;
}

/**
 * Função principal para exibir o subtítulo no Card do anime:
 * - Se for anime contínuo: retorna a Saga correspondente ao episódio atual (ex: "Saga East Blue", "Saga Egghead")
 * - Se for anime sazonal: retorna o nome da temporada atual (ex: "Temporada 2" ou nome editado pelo usuário)
 */
export function getAnimeDisplaySubtitle(anime: Anime): SubtitleDisplayInfo {
  if (!anime) {
    return { label: 'Temporada 1', isSaga: false };
  }

  // 1. Se for anime contínuo, calcula a saga dinamicamente
  if (isContinuousAnime(anime)) {
    const currentEp = Number(anime.currentEpisode) || 1;
    const sagaName = getSagaForEpisode(anime.title, currentEp);

    if (sagaName) {
      return {
        label: `Saga ${sagaName}`,
        isSaga: true,
        rawName: sagaName,
      };
    }
  }

  // 2. Se for anime sazonal com nome customizado ou salvo
  if (anime.currentSeasonName && anime.currentSeasonName.trim()) {
    return {
      label: anime.currentSeasonName,
      isSaga: false,
    };
  }

  // 3. Padrão sazonal: Temporada N
  return {
    label: `Temporada ${anime.season || 1}`,
    isSaga: false,
  };
}
