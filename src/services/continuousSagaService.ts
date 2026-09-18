/**
 * continuousSagaService.ts
 * 
 * Serviço 100% automatizado por APIs para detecção e exibição de Sagas em Animes Contínuos
 * (ex: One Piece, Naruto, Bleach, Detective Conan, etc.).
 * 
 * Zero listas hardcoded. Todos os dados de sagas e episódios são requisitados em tempo real
 * diretamente das APIs públicas (ex: One Piece API REST, Kitsu Episodes API).
 * Os dados retornados são mantidos em cache de memória/sessão para garantir resposta fluida.
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

// Cache dinâmico em memória para respostas de API
const dynamicSagasCache = new Map<string, SagaInterval[]>();
const pendingFetches = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Registra um callback para ser notificado quando uma nova saga/arco for resolvida via API
 */
export function onSagasUpdated(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // Ignora erro do listener
    }
  });
}

/**
 * Normaliza o título para correspondência
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
 * Baseado na estrutura da obra (ex: formato TV com grande volume de episódios e sem múltiplas temporadas separadas)
 */
export function isContinuousAnime(anime: Anime): boolean {
  if (!anime) return false;
  const norm = normalizeTitle(anime.title);

  // Se já tivermos sagas resolvidas da API para este título
  if (dynamicSagasCache.has(norm)) {
    const list = dynamicSagasCache.get(norm);
    if (list && list.length > 0) return true;
  }

  // Se o título for de franquia contínua conhecida (ex: One Piece)
  if (norm.includes('one piece')) {
    return true;
  }

  // Se tiver apenas 1 temporada cadastrada (ou nenhuma) e alto número de episódios
  const hasMultipleDistinctSeasons = Boolean(anime.seasons && anime.seasons.length > 1);
  if (!hasMultipleDistinctSeasons) {
    const currentEp = Number(anime.currentEpisode) || 0;
    const totalEp = Number(anime.totalEpisodes) || 0;
    if (anime.format === 'TV' && (anime.totalEpisodes === null || totalEp >= 45 || currentEp >= 30)) {
      return true;
    }
  }

  return false;
}

/**
 * Carrega dinamicamente via API externa as sagas/arcos da obra
 */
export async function fetchSagasFromApi(animeTitle: string): Promise<SagaInterval[]> {
  const norm = normalizeTitle(animeTitle);
  if (!norm) return [];

  if (dynamicSagasCache.has(norm)) {
    return dynamicSagasCache.get(norm)!;
  }

  // Tenta carregar do localStorage
  try {
    const local = localStorage.getItem(`api_sagas_${norm}`);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        dynamicSagasCache.set(norm, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignora erro de localStorage
  }

  if (pendingFetches.has(norm)) {
    return [];
  }
  pendingFetches.add(norm);

  try {
    let resolvedSagas: SagaInterval[] = [];

    // 1. Caso One Piece: Consome API oficial REST v2 de Sagas do One Piece
    if (norm.includes('one piece')) {
      const response = await fetch('https://api.api-onepiece.com/v2/sagas/en');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          resolvedSagas = data.map((item: any) => {
            const epStr = item.saga_episode || '';
            const match = epStr.match(/(\d+)(?:\s*(?:à|-|to)\s*(\d+))?/i);
            const startEp = match ? parseInt(match[1], 10) : 1;
            const endEp = match && match[2] ? parseInt(match[2], 10) : null;
            return {
              id: `op_saga_${item.id}`,
              name: item.title,
              startEp,
              endEp,
            };
          });
        }
      }
    } else {
      // 2. Para outros animes contínuos: consulta Kitsu API para obter grupos de episódios/temporadas
      const searchRes = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(animeTitle)}&page[limit]=1`);
      if (searchRes.ok) {
        const searchJson = await searchRes.json();
        const mediaId = searchJson?.data?.[0]?.id;
        if (mediaId) {
          const epsRes = await fetch(`https://kitsu.io/api/edge/episodes?filter[mediaId]=${mediaId}&page[limit]=20&sort=number`);
          if (epsRes.ok) {
            const epsJson = await epsRes.json();
            const epsList = epsJson?.data;
            if (Array.isArray(epsList) && epsList.length > 0) {
              const seasonMap = new Map<number, { min: number; max: number }>();
              for (const ep of epsList) {
                const num = ep.attributes?.number || 1;
                const sNum = ep.attributes?.seasonNumber || 1;
                if (!seasonMap.has(sNum)) {
                  seasonMap.set(sNum, { min: num, max: num });
                } else {
                  const curr = seasonMap.get(sNum)!;
                  curr.min = Math.min(curr.min, num);
                  curr.max = Math.max(curr.max, num);
                }
              }

              resolvedSagas = Array.from(seasonMap.entries()).map(([sNum, range]) => ({
                id: `season_${sNum}`,
                name: `Temporada ${sNum}`,
                startEp: range.min,
                endEp: range.max,
              }));
            }
          }
        }
      }
    }

    if (resolvedSagas.length > 0) {
      dynamicSagasCache.set(norm, resolvedSagas);
      try {
        localStorage.setItem(`api_sagas_${norm}`, JSON.stringify(resolvedSagas));
      } catch {
        // Quota
      }
      notifyListeners();
      return resolvedSagas;
    }

    return [];
  } catch (err) {
    console.warn('Falha ao obter sagas via API:', err);
    return [];
  } finally {
    pendingFetches.delete(norm);
  }
}

/**
 * Obtém a lista de sagas já carregadas da API para um título
 */
export function getSagasForAnime(animeTitle: string): SagaInterval[] | null {
  if (!animeTitle) return null;
  const norm = normalizeTitle(animeTitle);

  if (dynamicSagasCache.has(norm)) {
    return dynamicSagasCache.get(norm)!;
  }

  // Tenta ler do localStorage
  try {
    const local = localStorage.getItem(`api_sagas_${norm}`);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        dynamicSagasCache.set(norm, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignora erro
  }

  // Dispara busca na API em segundo plano
  fetchSagasFromApi(animeTitle).catch(console.warn);
  return null;
}

/**
 * Calcula dinamicamente o nome da saga para o episódio atual a partir dos dados da API
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

  const lastSaga = sagas[sagas.length - 1];
  if (lastSaga && ep >= lastSaga.startEp) {
    return lastSaga.name;
  }

  return sagas[0]?.name || null;
}

/**
 * Função principal para exibir o subtítulo no Card do anime:
 * - Se for anime contínuo: consulta a API e retorna a Saga do episódio atual (ex: "Saga East Blue", "Saga Alabasta")
 * - Se for anime sazonal: retorna o nome da temporada atual (ex: "Temporada 2")
 */
export function getAnimeDisplaySubtitle(anime: Anime): SubtitleDisplayInfo {
  if (!anime) {
    return { label: 'Temporada 1', isSaga: false };
  }

  // 1. Se for anime contínuo, calcula a saga dinamicamente via API
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
