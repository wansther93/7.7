/**
 * continuousSagaService.ts
 * 
 * Serviço 100% automatizado por APIs para detecção e exibição de Sagas em Animes Contínuos
 * e clássicos (ex: One Piece, Naruto, Bleach, Dragon Ball Z, Hunter x Hunter, Detective Conan, etc.).
 * 
 * Zero listas fixas hardcoded. Os dados de sagas, arcos e episódios são requisitados dinamicamente
 * via Wikipedia Action API (pt.wikipedia.org com fallback para en.wikipedia.org) e Kitsu Episodes API.
 * Os dados retornados são mantidos em cache de memória e localStorage para garantir resposta instantânea.
 */

import { Anime, SagaInterval } from '../types';
import { fetchSagasFromTmdb } from './tmdbService';

export type { SagaInterval };

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
 * Baseado na estrutura da obra ou franquias conhecidas de transmissão ininterrupta
 */
export function isContinuousAnime(anime: Anime): boolean {
  if (!anime) return false;
  const norm = normalizeTitle(anime.title);

  // Se já tivermos sagas resolvidas da API para este título
  if (dynamicSagasCache.has(norm)) {
    const list = dynamicSagasCache.get(norm);
    if (list && list.length > 0) return true;
  }

  // Se o título for de franquia contínua conhecida
  if (
    norm.includes('one piece') ||
    norm.includes('naruto') ||
    norm.includes('bleach') ||
    norm.includes('dragon ball') ||
    norm.includes('detective conan') ||
    norm.includes('gintama') ||
    norm.includes('hunter x hunter') ||
    norm.includes('fairy tail') ||
    norm.includes('black clover') ||
    norm.includes('boruto')
  ) {
    return true;
  }

  // Se tiver apenas 1 temporada cadastrada (ou nenhuma) e alto volume de episódios
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
 * Analisa e extrai sagas/arcos estruturados a partir do wikitext da Wikipedia
 */
function parseWikitextSagas(wikitext: string): SagaInterval[] {
  if (!wikitext) return [];

  const sagas: SagaInterval[] = [];
  const lines = wikitext.split('\n');

  // Estratégia A: Tabela estilizada de Sagas (padrão One Piece)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (
      line.startsWith('!Saga') ||
      line.startsWith('! Saga') ||
      (line.startsWith("!'''") && line.toLowerCase().includes('saga'))
    ) {
      const name = line.replace(/^!\s*/, '').replace(/'''/g, '').replace(/\[\[|\]\]/g, '').trim();
      let next = lines[i + 1] ? lines[i + 1].trim() : '';
      let rangeMatch = next.match(/^[!|]\s*(\d+)\s*[–\-—]\s*(\d+|\?|presente)?/i);
      if (!rangeMatch && lines[i + 2]) {
        next = lines[i + 2].trim();
        rangeMatch = next.match(/^[!|]\s*(\d+)\s*[–\-—]\s*(\d+|\?|presente)?/i);
      }
      if (rangeMatch) {
        const startEp = parseInt(rangeMatch[1], 10);
        const endEp =
          !rangeMatch[2] || rangeMatch[2] === '?' || rangeMatch[2].toLowerCase() === 'presente'
            ? null
            : parseInt(rangeMatch[2], 10);
        sagas.push({
          id: `saga_${sagas.length + 1}`,
          name,
          startEp,
          endEp,
        });
      }
    }
  }

  // Estratégia B: Tabela de Temporadas com intervalos na mesma linha/coluna (padrão Naruto / Naruto Shippuden)
  if (sagas.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const seasonMatch = line.match(/(?:'''|\[\[)?(?:#.*\|)?(\d+[\.ªº\s]+Temporada)[^'\]]*('''.*)?/i);
      if (seasonMatch && (line.includes('align=') || line.startsWith('|'))) {
        const seasonName = seasonMatch[1].trim();
        for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
          const epLine = lines[j];
          const range = epLine.match(/(\d+)\s*[~–\-—]\s*(\d+)/);
          if (range) {
            const startEp = parseInt(range[1], 10);
            const endEp = parseInt(range[2], 10);
            sagas.push({
              id: `season_${sagas.length + 1}`,
              name: seasonName,
              startEp,
              endEp,
            });
            break;
          }
        }
      }
    }
  }

  // Estratégia C: Seções de cabeçalho (=== N.ª Temporada - Nome === ou == Saga ... ==) com tabela de episódios
  if (sagas.length === 0) {
    interface SectionHeader {
      name: string;
      lineIdx: number;
    }
    const sections: SectionHeader[] = [];

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      // Bleach: === 1.ª Temporada - O Substituto ===
      const mBleach = l.match(/^===\s*(\d+)[\.ªº\s]+Temporada\s*[-–—:]\s*(.+?)(?:\s*\(\d+.*\))?\s*===/i);
      if (mBleach) {
        sections.push({
          name: `Temporada ${mBleach[1]} - ${mBleach[2].trim()}`,
          lineIdx: i,
        });
        continue;
      }

      // DBZ / Hunter x Hunter / Genéricos: == Saga ... == ou == Arco ... ==
      const mGeneric = l.match(/^==\s*(Saga\s+[^=]+|Arco\s+[^=]+)\s*==/i);
      if (mGeneric) {
        sections.push({
          name: mGeneric[1].trim(),
          lineIdx: i,
        });
      }
    }

    if (sections.length > 0) {
      for (let s = 0; s < sections.length; s++) {
        const sec = sections[s];
        const nextLineIdx = sections[s + 1] ? sections[s + 1].lineIdx : lines.length;
        let minEp = Infinity;
        let maxEp = -Infinity;

        for (let l = sec.lineIdx; l < nextLineIdx; l++) {
          const line = lines[l];
          // DBZ: | NúmeroEpisódio = 1
          const dbzMatch = line.match(/NúmeroEpisódio\s*=\s*(\d+)/i);
          if (dbzMatch) {
            const n = parseInt(dbzMatch[1], 10);
            if (n > 0 && n < 3000) {
              minEp = Math.min(minEp, n);
              maxEp = Math.max(maxEp, n);
            }
          }
          // Bleach: |rowspan=1 ...|1
          const tableMatch = line.match(/\|(?:rowspan=[^|]*\|)?\s*(\d+)\s*$/);
          if (tableMatch) {
            const n = parseInt(tableMatch[1], 10);
            if (n > 0 && n < 3000) {
              minEp = Math.min(minEp, n);
              maxEp = Math.max(maxEp, n);
            }
          }
        }

        if (minEp !== Infinity && maxEp !== -Infinity) {
          sagas.push({
            id: `saga_${sagas.length + 1}`,
            name: sec.name,
            startEp: minEp,
            endEp: maxEp,
          });
        }
      }
    }
  }

  return sagas;
}

/**
 * Consulta a Wikipedia Action API oficial (pt.wikipedia.org com fallback para en.wikipedia.org)
 */
async function fetchWikipediaSagas(animeTitle: string): Promise<SagaInterval[]> {
  const cleanTitle = animeTitle.trim();

  // 1. Busca no Wikipedia em Português
  try {
    const searchUrl = `https://pt.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      `Lista de episódios de ${cleanTitle}`
    )}&limit=3&namespace=0&format=json`;
    const searchRes = await fetch(searchUrl, {
      headers: { 'User-Agent': 'WAnimeList/1.0 (contact@wanimelist.app)' },
    }).then((r) => r.json());

    const pageTitle = searchRes?.[1]?.[0] || `Lista de episódios de ${cleanTitle}`;
    const parseUrl = `https://pt.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
      pageTitle
    )}&prop=wikitext&format=json`;
    const parseRes = await fetch(parseUrl, {
      headers: { 'User-Agent': 'WAnimeList/1.0 (contact@wanimelist.app)' },
    }).then((r) => r.json());

    const wikitext = parseRes?.parse?.wikitext?.['*'] || '';
    const parsed = parseWikitextSagas(wikitext);
    if (parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.debug('Wikipedia PT parser avisou:', err);
  }

  // 2. Fallback no Wikipedia em Inglês se PT não tiver
  try {
    const enSearchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      `List of ${cleanTitle} episodes`
    )}&limit=3&namespace=0&format=json`;
    const enSearchRes = await fetch(enSearchUrl, {
      headers: { 'User-Agent': 'WAnimeList/1.0 (contact@wanimelist.app)' },
    }).then((r) => r.json());

    const enPageTitle = enSearchRes?.[1]?.[0];
    if (enPageTitle) {
      const enParseUrl = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(
        enPageTitle
      )}&prop=wikitext&format=json`;
      const enParseRes = await fetch(enParseUrl, {
        headers: { 'User-Agent': 'WAnimeList/1.0 (contact@wanimelist.app)' },
      }).then((r) => r.json());

      const enWikitext = enParseRes?.parse?.wikitext?.['*'] || '';
      const enParsed = parseWikitextSagas(enWikitext);
      if (enParsed.length > 0) {
        return enParsed;
      }
    }
  } catch (err) {
    console.debug('Wikipedia EN parser avisou:', err);
  }

  return [];
}

/**
 * Fallback para Kitsu API caso a Wikipedia não possua uma página de episódios
 */
async function fetchKitsuEpisodesSagas(animeTitle: string): Promise<SagaInterval[]> {
  try {
    const searchRes = await fetch(
      `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(animeTitle)}&page[limit]=1`
    );
    if (!searchRes.ok) return [];

    const searchJson = await searchRes.json();
    const mediaId = searchJson?.data?.[0]?.id;
    if (!mediaId) return [];

    const epsRes = await fetch(
      `https://kitsu.io/api/edge/episodes?filter[mediaId]=${mediaId}&page[limit]=50&sort=number`
    );
    if (!epsRes.ok) return [];

    const epsJson = await epsRes.json();
    const epsList = epsJson?.data;
    if (!Array.isArray(epsList) || epsList.length === 0) return [];

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

    return Array.from(seasonMap.entries()).map(([sNum, range]) => ({
      id: `season_${sNum}`,
      name: `Temporada ${sNum}`,
      startEp: range.min,
      endEp: range.max,
    }));
  } catch {
    return [];
  }
}

/**
 * Carrega dinamicamente via APIs públicas universais as sagas/arcos da obra
 */
export async function fetchSagasFromApi(animeTitle: string): Promise<SagaInterval[]> {
  const norm = normalizeTitle(animeTitle);
  if (!norm) return [];

  if (dynamicSagasCache.has(norm)) {
    return dynamicSagasCache.get(norm)!;
  }

  // Tenta carregar do localStorage
  try {
    const local = localStorage.getItem(`api_sagas_v2_${norm}`);
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
    // 1. Consulta oficial do The Movie Database (TMDB) via API Key
    let resolvedSagas = await fetchSagasFromTmdb(animeTitle);

    // 2. Fallback para Wikipedia Action API se TMDB não tiver
    if (resolvedSagas.length === 0) {
      resolvedSagas = await fetchWikipediaSagas(animeTitle);
    }

    // 3. Fallback para Kitsu se ainda não houver
    if (resolvedSagas.length === 0) {
      resolvedSagas = await fetchKitsuEpisodesSagas(animeTitle);
    }

    if (resolvedSagas.length > 0) {
      dynamicSagasCache.set(norm, resolvedSagas);
      try {
        localStorage.setItem(`api_sagas_v2_${norm}`, JSON.stringify(resolvedSagas));
      } catch {
        // Quota
      }
      notifyListeners();
      return resolvedSagas;
    }

    return [];
  } catch (err) {
    console.warn('Falha ao obter sagas via APIs:', err);
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
    const local = localStorage.getItem(`api_sagas_v2_${norm}`);
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
 * - Se for anime contínuo: consulta a API e retorna a Saga do episódio atual (ex: "Saga de East Blue", "Temporada 1 - O Substituto")
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
      const lower = sagaName.toLowerCase();
      const formattedLabel =
        lower.startsWith('saga') || lower.startsWith('temporada') || lower.startsWith('arco')
          ? sagaName
          : `Saga ${sagaName}`;

      return {
        label: formattedLabel,
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
