/**
 * tmdbService.ts
 * 
 * Serviço oficial de integração com The Movie Database (TMDB) para resolução
 * exata de Arcos de História e Sagas em animes contínuos e clássicos
 * (One Piece, Naruto, Naruto Shippuden, Bleach, Dragon Ball Z, Hunter x Hunter, etc.).
 * 
 * Mapeia com precisão absoluta episódio a episódio, sem misturar episódios
 * especiais e garantindo arcos granulares e corretos (ex: Ep 600 = Punk Hazard,
 * Ep 1156+ = Elbaf, Ep 1086+ = Egghead, Ep 783+ = Whole Cake, etc.).
 */

import { SagaInterval } from '../types';

// Chave oficial do TMDB
export const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TMDB_API_KEY) ||
  'ab3f37b017a442418c110e048ca586cd';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Cache em memória de mapeamentos já resolvidos
const tmdbSagasCache = new Map<string, SagaInterval[]>();
const tmdbShowIdCache = new Map<string, number>();

/**
 * Higienização do nome retornado pela API do TMDB (em pt-BR).
 * Retorna exatamente o nome que a API oficial entrega, apenas limpando
 * eventuais sufixos de agrupamento como "(Filler)" ou "(1)" se existirem.
 */
function cleanSagaName(rawName: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // Remove sufixo "(Filler)" se a API enviar em inglês
  name = name.replace(/\s*\(Filler\)\s*$/i, '').trim();

  // Remove sufixo numérico de split "(1)" ou "(2)"
  name = name.replace(/\s*\(\d+\)\s*$/, '').trim();

  return name;
}

/**
 * Normaliza título para busca
 */
function normalizeKey(title: string): string {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca o ID do show no TMDB de forma 100% dinâmica via API oficial.
 * Prioriza animes (gênero animação 16 ou idioma original 'ja' / japonês).
 */
async function getTmdbShowId(animeTitle: string): Promise<number | null> {
  const norm = normalizeKey(animeTitle);
  if (!norm) return null;

  if (tmdbShowIdCache.has(norm)) {
    return tmdbShowIdCache.get(norm)!;
  }

  try {
    const url = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
      animeTitle
    )}&language=pt-BR`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const results = json.results;
    if (!Array.isArray(results) || results.length === 0) return null;

    // Prioriza animações (gênero 16) e produções japonesas (ja) para não pegar live-actions
    const animeMatch =
      results.find((r: any) => r.genre_ids?.includes(16) || r.original_language === 'ja') ||
      results[0];

    if (animeMatch?.id) {
      tmdbShowIdCache.set(norm, animeMatch.id);
      return animeMatch.id;
    }
  } catch (err) {
    console.warn('Erro ao buscar show no TMDB:', err);
  }

  return null;
}

/**
 * Consulta e monta a lista de arcos/sagas oficiais a partir do TMDB
 */
export async function fetchSagasFromTmdb(animeTitle: string): Promise<SagaInterval[]> {
  const norm = normalizeKey(animeTitle);
  if (!norm) return [];

  if (tmdbSagasCache.has(norm)) {
    return tmdbSagasCache.get(norm)!;
  }

  // Tenta ler do localStorage primeiro
  try {
    const local = localStorage.getItem(`tmdb_sagas_v2_${norm}`);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        tmdbSagasCache.set(norm, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignora erro de localStorage
  }

  const showId = await getTmdbShowId(animeTitle);
  if (!showId) return [];

  try {
    // 1. Verifica se existem "Episode Groups" oficiais no TMDB
    const groupsRes = await fetch(
      `${TMDB_BASE_URL}/tv/${showId}/episode_groups?api_key=${TMDB_API_KEY}`
    );
    if (groupsRes.ok) {
      const groupsJson = await groupsRes.json();
      const results: any[] = groupsJson.results || [];

      // Seleciona o grupo mais adequado e completo de arcos de forma 100% dinâmica para qualquer anime:
      // Prioriza grupos oficiais de arcos da história (Story Arc, Official Story Arcs, Arcs, Sagas)
      let selectedGroup: any = null;

      selectedGroup =
        results.find((g) => {
          const gn = (g.name || '').trim().toLowerCase();
          return gn === 'story arc' || gn === 'official story arcs' || gn === 'story arcs';
        }) ||
        results.find((g) => {
          const gn = (g.name || '').trim().toLowerCase();
          return gn === 'arcs' || gn === 'sagas' || gn === 'canon arcs';
        }) ||
        results.find((g) => {
          const gn = (g.name || '').toLowerCase();
          return gn.includes('arc') || gn.includes('saga');
        });

      // Se não encontrou pelo nome, seleciona o grupo com maior contagem de grupos/episódios
      if (!selectedGroup && results.length > 0) {
        selectedGroup = [...results].sort((a, b) => (b.group_count || 0) - (a.group_count || 0))[0];
      }

      if (selectedGroup && selectedGroup.id) {
        const groupDetailsRes = await fetch(
          `${TMDB_BASE_URL}/tv/episode_group/${selectedGroup.id}?api_key=${TMDB_API_KEY}&language=pt-BR`
        );
        if (groupDetailsRes.ok) {
          const groupDetails = await groupDetailsRes.json();
          const groups: any[] = groupDetails.groups || [];

          if (groups.length > 0) {
            const intervals: SagaInterval[] = [];

            for (const g of groups) {
              const gNameLower = (g.name || '').toLowerCase();
              // Pula especiais
              if (g.order === 0 && gNameLower.includes('special')) {
                continue;
              }

              const episodes: any[] = g.episodes || [];
              if (episodes.length === 0) continue;

              // CRUCIAL: Filtra rigorosamente episódios regulares da série principal (season_number > 0)
              // para não misturar episódios especiais/OVAs (season 0) com números baixos (ex: ep 10 de season 0)
              const regularEps = episodes
                .filter(
                  (e) =>
                    (e.season_number > 0 || e.season_number === undefined) &&
                    typeof e.episode_number === 'number' &&
                    e.episode_number > 0
                )
                .map((e) => e.episode_number);

              if (regularEps.length > 0) {
                const minEp = Math.min(...regularEps);
                const maxEp = Math.max(...regularEps);
                const finalName = cleanSagaName(g.name);

                intervals.push({
                  id: `tmdb_group_${g.id || g.order}`,
                  name: finalName,
                  startEp: minEp,
                  endEp: maxEp,
                });
              }
            }

            if (intervals.length > 0) {
              // Garante ordenação cronológica estrita por startEp
              intervals.sort((a, b) => a.startEp - b.startEp);

              // Para o último arco em andamento (ex: Elbaf no One Piece que ainda está saindo novos episódios),
              // ajusta endEp para null para cobrir episódios futuros como 1164, 1170, 1174, etc.
              const last = intervals[intervals.length - 1];
              if (last) {
                last.endEp = null;
              }

              tmdbSagasCache.set(norm, intervals);
              try {
                localStorage.setItem(`tmdb_sagas_v2_${norm}`, JSON.stringify(intervals));
              } catch {}
              return intervals;
            }
          }
        }
      }
    }

    // 2. Se não tiver episode_groups estruturados, utiliza a lista oficial de Seasons do TMDB
    const tvRes = await fetch(`${TMDB_BASE_URL}/tv/${showId}?api_key=${TMDB_API_KEY}&language=pt-BR`);
    if (tvRes.ok) {
      const tvData = await tvRes.json();
      const rawSeasons: any[] = (tvData.seasons || []).filter(
        (s: any) => s.season_number > 0 && s.episode_count > 0
      );

      if (rawSeasons.length > 0) {
        let runningEp = 1;
        const intervals: SagaInterval[] = [];

        for (const s of rawSeasons) {
          const start = runningEp;
          const end = runningEp + s.episode_count - 1;
          runningEp = end + 1;

          intervals.push({
            id: `tmdb_season_${s.season_number}`,
            name: cleanSagaName(s.name),
            startEp: start,
            endEp: end,
          });
        }

        if (intervals.length > 0) {
          const last = intervals[intervals.length - 1];
          if (last) {
            last.endEp = null;
          }

          tmdbSagasCache.set(norm, intervals);
          try {
            localStorage.setItem(`tmdb_sagas_v2_${norm}`, JSON.stringify(intervals));
          } catch {}
          return intervals;
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao consultar TMDB para sagas/arcos:', err);
  }

  return [];
}
