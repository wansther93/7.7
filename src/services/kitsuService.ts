/**
 * kitsuService.ts
 * 
 * Integração pública e gratuita com a API Kitsu (https://kitsu.io/api/edge/).
 * Permite buscar capas de animes em alta resolução (originais, arte de Blu-ray e posters limpos)
 * e metadados de episódios para enriquecer animes contínuos de forma rápida, fluida e desacoplada.
 */

export interface KitsuCoverResult {
  id: string;
  title: string;
  englishTitle?: string;
  subtype?: string; // 'TV' | 'movie' | 'OVA' | 'special'
  year?: string;
  episodesCount?: number | null;
  imageUrl: string;
  smallImageUrl?: string;
}

export interface KitsuEpisodeData {
  number: number;
  seasonNumber?: number;
  title?: string;
  synopsis?: string;
  airdate?: string;
}

// Cache em memória para evitar requisições repetidas na mesma sessão
const coversMemoryCache = new Map<string, KitsuCoverResult[]>();
const episodeMemoryCache = new Map<string, KitsuEpisodeData[]>();

/**
 * Busca capas alternativas e de alta resolução no Kitsu pelo nome do anime.
 * Traz resultados de forma rápida e fluida (limite padrão: 8 a 10 capas).
 */
export async function searchKitsuCovers(query: string, limit = 8, offset = 0): Promise<KitsuCoverResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const cacheKey = `kitsu_covers_${cleanQuery.toLowerCase()}_${limit}_${offset}`;
  if (coversMemoryCache.has(cacheKey)) {
    return coversMemoryCache.get(cacheKey)!;
  }

  // Tenta ler do localStorage primeiro para carregamento instantâneo
  try {
    const local = localStorage.getItem(cacheKey);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed) && parsed.length > 0) {
        coversMemoryCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch {
    // Ignora erro de localStorage
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500); // 4.5s timeout

  try {
    const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(cleanQuery)}&page[limit]=${limit}&page[offset]=${offset}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Kitsu API error status ${response.status}`);
    }

    const json = await response.json();
    const dataList = json?.data;
    if (!Array.isArray(dataList)) return [];

    const results: KitsuCoverResult[] = [];
    const seenUrls = new Set<string>();

    for (const item of dataList) {
      const attrs = item.attributes || {};
      const poster = attrs.posterImage;
      const imageUrl = poster?.large || poster?.original || poster?.medium;
      if (!imageUrl || seenUrls.has(imageUrl)) continue;
      seenUrls.add(imageUrl);

      const title = attrs.canonicalTitle || attrs.titles?.en || attrs.titles?.en_jp || cleanQuery;
      const englishTitle = attrs.titles?.en || undefined;
      const subtype = (attrs.subtype || 'TV').toUpperCase();
      const year = attrs.startDate ? attrs.startDate.substring(0, 4) : undefined;
      const episodesCount = attrs.episodeCount || null;

      results.push({
        id: String(item.id),
        title,
        englishTitle,
        subtype,
        year,
        episodesCount,
        imageUrl,
        smallImageUrl: poster?.small || poster?.medium || imageUrl,
      });
    }

    coversMemoryCache.set(cacheKey, results);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(results.slice(0, 12)));
    } catch {
      // Quota de localStorage
    }

    return results;
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('Busca de capas no Kitsu falhou ou deu timeout:', error);
    return [];
  }
}

/**
 * Consulta informações de episódios no Kitsu para animes contínuos
 */
export async function getKitsuEpisodes(kitsuMediaId: string, pageLimit = 20): Promise<KitsuEpisodeData[]> {
  if (!kitsuMediaId) return [];

  const cacheKey = `kitsu_eps_${kitsuMediaId}_${pageLimit}`;
  if (episodeMemoryCache.has(cacheKey)) {
    return episodeMemoryCache.get(cacheKey)!;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const url = `https://kitsu.io/api/edge/episodes?filter[mediaId]=${encodeURIComponent(kitsuMediaId)}&page[limit]=${pageLimit}&sort=number`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) return [];
    const json = await response.json();
    const list = json?.data;
    if (!Array.isArray(list)) return [];

    const episodes: KitsuEpisodeData[] = list.map((item: any) => ({
      number: item.attributes?.number || 0,
      seasonNumber: item.attributes?.seasonNumber,
      title: item.attributes?.canonicalTitle,
      synopsis: item.attributes?.synopsis,
      airdate: item.attributes?.airdate,
    }));

    episodeMemoryCache.set(cacheKey, episodes);
    return episodes;
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}
