/**
 * Serviço de Detecção e Gestão de Franquias & Árvore de Temporadas e Arcos (100% Gratuito)
 * Conecta todas as temporadas, arcos, filmes e OVAs de uma obra em uma linha do tempo unificada.
 * Suporta busca recursiva profunda, filtros audiovisuais estritos e presets canônicos.
 */
import type { Anime, AnimeSeasonOrArc, FranchiseTreeItem, FranchiseCandidate } from '../types';
import { searchAnimeMetadata } from './jikanService';

// Normalizador de título de franquia (unifica nomes ocidentais, japoneses e remove sufixos de temporada)
export function getFranchiseRootTitle(title: string): string {
  if (!title) return '';
  let cleaned = title.toLowerCase().trim();

  // Mapeamento direto de nomes ocidentais e populares para raízes canônicas unificadas
  if (/demon\s*slayer|kimetsu\s*no\s*yaiba/gi.test(cleaned)) {
    return 'kimetsu no yaiba';
  }
  if (/slime|tensei\s*shitara\s*slime|reincarnated\s*as\s*a\s*slime|tensura/gi.test(cleaned)) {
    return 'tensei shitara slime datta ken';
  }
  if (/attack\s*on\s*titan|shingeki\s*no\s*kyojin/gi.test(cleaned)) {
    return 'shingeki no kyojin';
  }
  if (/my\s*hero\s*academia|boku\s*no\s*hero/gi.test(cleaned)) {
    return 'boku no hero academia';
  }
  if (/jujutsu\s*kaisen|sorcery\s*fight/gi.test(cleaned)) {
    return 'jujutsu kaisen';
  }
  if (/mushoku\s*tensei|jobless\s*reincarnation/gi.test(cleaned)) {
    return 'mushoku tensei';
  }
  if (/solo\s*leveling|ore\s*dake\s*level/gi.test(cleaned)) {
    return 'solo leveling';
  }
  if (/re\s*:\s*zero|rezero|starting\s*life\s*in\s*another\s*world/gi.test(cleaned)) {
    return 're:zero';
  }
  if (/frieren|sousou\s*no\s*frieren/gi.test(cleaned)) {
    return 'frieren';
  }
  if (/danmachi|pick\s*up\s*girls\s*in\s*a\s*dungeon|dungeon\s*ni\s*deai/gi.test(cleaned)) {
    return 'danmachi';
  }
  if (/konosuba|kono\s*subarashii/gi.test(cleaned)) {
    return 'konosuba';
  }

  cleaned = cleaned
    .replace(/mushuku tensei/gi, 'mushoku tensei')
    .replace(/demom slayer/gi, 'demon slayer')
    .replace(/kimetsu no yaba/gi, 'kimetsu no yaiba')
    .replace(/shingeky/gi, 'shingeki')
    .replace(/jujultsu/gi, 'jujutsu')
    .replace(/rezero/gi, 're:zero')
    .replace(/:\s*season\s*\d+/gi, '')
    .replace(/\s*\d+(?:nd|rd|th|st)?\s*season/gi, '')
    .replace(/:\s*\d+(?:nd|rd|th|st)?\s*season/gi, '')
    .replace(/\s*season\s*\d+/gi, '')
    .replace(/\s*temporada\s*\d+/gi, '')
    .replace(/:\s*yuukaku-hen|:\s*entertainment district arc/gi, '')
    .replace(/:\s*katanakaji no sato-hen|:\s*swordsmith village arc/gi, '')
    .replace(/:\s*hashira geiko-hen|:\s*hashira training arc/gi, '')
    .replace(/:\s*mugen ressha-hen|:\s*mugentrain arc/gi, '')
    .replace(/:\s*mugen jou-hen|:\s*infinity castle/gi, '')
    .replace(/:\s*shibuya jihen|:\s*shibuya incident/gi, '')
    .replace(/:\s*kaigyoku\s*\/\s*gyokusetsu/gi, '')
    .replace(/:\s*isekai ittara honki dasu.*$/gi, '')
    .replace(/:\s*tensura nikki.*$/gi, '')
    .replace(/:\s*the final season.*$/gi, '')
    .replace(/:\s*final season.*$/gi, '')
    .replace(/:\s*part\s*\d+/gi, '')
    .replace(/\s*part\s*\d+/gi, '')
    .replace(/:\s*parte\s*\d+/gi, '')
    .replace(/\s*parte\s*\d+/gi, '')
    .replace(/:\s*2nd\s*cour/gi, '')
    .replace(/:\s*cour\s*\d+/gi, '')
    .replace(/\s*iii+\b/gi, '')
    .replace(/\s*ii\b/gi, '')
    .replace(/\s*iv\b/gi, '')
    .replace(/\s*v\b/gi, '')
    .replace(/\(tv\)/gi, '')
    .replace(/:\s*tv\b/gi, '')
    .replace(/[^\w\s\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

// Formatos estritamente audiovisuais permitidos
const ALLOWED_AUDIOVISUAL_FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL']);

// Tipos de relações válidas
const VALID_RELATION_TYPES = new Set(['SEQUEL', 'PREQUEL', 'PARENT_STORY', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE_SETTING', 'ALTERNATIVE_VERSION', 'SUMMARY']);


/**
 * Formata o título da temporada/filme de forma amigável em português,
 * garantindo identificação clara de arcos, filmes e partes sem textos cortados ou confusos.
 */
function formatMediaTitlePT(title: string, format: string, index: number, rootTitle?: string): string {
  const t = title.trim();
  const lower = t.toLowerCase();
  
  // 1. Regras específicas para Kimetsu no Yaiba (Demon Slayer)
  if (lower.includes('kimetsu no yaiba') || lower.includes('demon slayer')) {
    if (lower.includes('mugen ressha') || lower.includes('mugen train')) {
      return format === 'MOVIE' ? 'Filme: Trem Infinito (Mugen Train)' : 'Arco do Trem Infinito (Mugen Train)';
    }
    if (lower.includes('mugen jou') || lower.includes('infinity castle')) {
      return 'Filme: Castelo Infinito (Infinity Castle)';
    }
    if (lower.includes('yuukaku') || lower.includes('entertainment district')) {
      return '2ª Temporada: Distrito do Entretenimento';
    }
    if (lower.includes('katanakaji no sato') || lower.includes('swordsmith village')) {
      return '3ª Temporada: Vila dos Ferreiros';
    }
    if (lower.includes('hashira geiko') || lower.includes('hashira training')) {
      return '4ª Temporada: Treinamento dos Hashiras';
    }
    if (lower.includes('kyoudai no kizuna')) {
      return 'Filme Especial: Laço de Irmãos';
    }
    if (lower.includes('asahigaoka') || lower.includes('tsuzumi')) {
      return 'Especial: Mansão Tsuzumi';
    }
    if (lower.includes('natagumo')) {
      return 'Especial: Monte Natagumo';
    }
    if (index === 0) {
      return '1ª Temporada (Tanjiro Kamado: Arco de Resolução)';
    }
  }

  // 2. Regras específicas para Mushoku Tensei
  if (lower.includes('mushoku tensei')) {
    if (lower.includes('eris') || lower.includes('goblin')) {
      return 'OVA Especial: Eris Caça Goblins';
    }
    if (lower.includes('season 2') || lower.includes(' 2nd season') || lower.includes(' ii')) {
      if (lower.includes('part 2') || lower.includes('2nd cour')) {
        return '2ª Temporada - Parte 2 (Labirinto de Teletransporte)';
      }
      return '2ª Temporada - Parte 1 (Arco Ranoa & Academia)';
    }
    if (lower.includes('season 3') || lower.includes(' 3rd season') || lower.includes(' iii')) {
      return '3ª Temporada (Mushoku Tensei III)';
    }
    if (lower.includes('part 2') || lower.includes('2nd cour')) {
      return '1ª Temporada - Parte 2 (Continente Demônio & Retorno)';
    }
    if (index === 0 || lower.includes('part 1') || lower.includes('1st cour')) {
      return '1ª Temporada - Parte 1 (Infância & Teletransporte)';
    }
  }

  // 3. Regras específicas para Tensei Shitara Slime Datta Ken (Slime)
  if (lower.includes('tensei shitara slime') || lower.includes('tensura')) {
    if (lower.includes('guren no kizuna') || lower.includes('scarlet bond')) {
      return 'Filme: Laços Escarlates (Guren no Kizuna)';
    }
    if (lower.includes('tensura nikki') || lower.includes('slime diaries')) {
      return 'Tensura Nikki: Diários de Slime (Spin-off)';
    }
    if (lower.includes('coleus')) {
      return 'Especiais: Sonho de Coleus (3 episódios)';
    }
    if (lower.includes('season 4') || lower.includes('4th season') || lower.includes(' iv')) {
      return '4ª Temporada (4th Season)';
    }
    if (lower.includes('season 3') || lower.includes('3rd season') || lower.includes(' iii')) {
      return '3ª Temporada (Festival de Abertura de Tempest)';
    }
    if (lower.includes('season 2') || lower.includes('2nd season') || lower.includes(' ii')) {
      if (lower.includes('part 2') || lower.includes('2nd cour')) {
        return '2ª Temporada - Parte 2 (Walpurgis)';
      }
      return '2ª Temporada - Parte 1 (O Despertar do Lorde Demônio)';
    }
    if (lower.includes('ova')) {
      return 'OVAs Especiais de Slime';
    }
    if (index === 0) {
      return '1ª Temporada (Fundação da Federação Jura Tempest)';
    }
  }

  // 4. Regras específicas para Jujutsu Kaisen
  if (lower.includes('jujutsu kaisen')) {
    if (lower.includes(' 0') || lower.includes(': 0')) {
      return 'Filme: Jujutsu Kaisen 0 (Origens)';
    }
    if (lower.includes('kaigyoku') || lower.includes('shibuya') || lower.includes('season 2') || lower.includes('2nd season')) {
      return '2ª Temporada: Passado de Gojo & Incidente de Shibuya';
    }
    if (lower.includes('shimetsu') || lower.includes('culling') || lower.includes('season 3') || lower.includes('3rd season')) {
      return '3ª Temporada: Jogo do Abate (Culling Game)';
    }
    if (index === 0) {
      return '1ª Temporada (Feto Amaldiçoado & Torneio de Kyoto)';
    }
  }

  // 5. Regras específicas para Re:Zero
  if (lower.includes('re:zero') || lower.includes('rezero')) {
    if (lower.includes('memory snow')) {
      return 'Filme OVA: Memory Snow';
    }
    if (lower.includes('hyouketsu') || lower.includes('frozen bond')) {
      return 'Filme OVA: Laços Congelados (Frozen Bond)';
    }
    if (lower.includes('season 2') || lower.includes('2nd season')) {
      if (lower.includes('part 2') || lower.includes('2nd cour')) {
        return '2ª Temporada - Parte 2 (Libertação do Santuário)';
      }
      return '2ª Temporada - Parte 1 (Santuário de Echidna)';
    }
    if (lower.includes('season 3') || lower.includes('3rd season')) {
      return '3ª Temporada (Cidade de Priestella)';
    }
    if (index === 0) {
      return '1ª Temporada (Mansão Roswaal & Baleia Branca)';
    }
  }

  // 6. Regras específicas para Solo Leveling
  if (lower.includes('solo leveling') || lower.includes('ore dake level')) {
    if (lower.includes('reawakening')) {
      return 'Filme: ReAwakening';
    }
    if (lower.includes('arise') || lower.includes('season 2') || lower.includes('2nd season')) {
      return '2ª Temporada: Arise from the Shadow';
    }
    if (index === 0) {
      return '1ª Temporada (Despertar do Caçador Sung Jin-woo)';
    }
  }

  // 7. Formatação inteligente genérica (remove prefixos redundantes de raiz)
  let cleaned = t;
  if (rootTitle && cleaned.toLowerCase().startsWith(rootTitle.toLowerCase())) {
    const withoutRoot = cleaned.slice(rootTitle.length).replace(/^[:\s-]+/, '').trim();
    if (withoutRoot.length >= 3) {
      cleaned = withoutRoot;
    }
  }

  // Tradução de temporadas e partes para português
  cleaned = cleaned
    .replace(/(\d+)(?:nd|rd|th|st)?\s*season/gi, '$1ª Temporada')
    .replace(/season\s*(\d+)/gi, '$1ª Temporada')
    .replace(/the\s*final\s*season/gi, 'Temporada Final')
    .replace(/final\s*season/gi, 'Temporada Final')
    .replace(/part\s*(\d+)/gi, 'Parte $1')
    .replace(/cour\s*(\d+)/gi, 'Parte $1')
    .replace(/2nd\s*cour/gi, 'Parte 2')
    .replace(/1st\s*cour/gi, 'Parte 1');

  if (format === 'MOVIE') {
    if (!cleaned.toLowerCase().includes('filme') && !cleaned.toLowerCase().includes('movie')) {
      return `Filme: ${cleaned}`;
    }
    return cleaned.replace(/^movie:\s*/i, 'Filme: ');
  }
  
  if (format === 'OVA') {
    if (!cleaned.toLowerCase().includes('ova')) {
      return `OVA: ${cleaned}`;
    }
    return cleaned;
  }

  if (format === 'SPECIAL') {
    if (!cleaned.toLowerCase().includes('especial') && !cleaned.toLowerCase().includes('special')) {
      return `Especial: ${cleaned}`;
    }
    return cleaned;
  }

  return cleaned;
}

/**
 * Filtro de relevância de franquia para evitar poluição em buscas textuais livres
 */
function isRelevantFranchiseNode(
  nodeTitle: string,
  rootWords: string[],
  rootTitle?: string
): boolean {
  if (!nodeTitle) return false;
  const lower = nodeTitle.toLowerCase();
  
  // Exclusões explícitas de crossovers conhecidos
  if (lower.includes('isekai quartet') && !rootWords.some(w => w.includes('isekai quartet'))) {
    return false;
  }

  // Proteção para raízes de nomes comuns/curtos como "Another", evitando isekais e falsos positivos
  const normRoot = (rootTitle || '').toLowerCase().trim();
  if (normRoot === 'another') {
    // Se a busca é pela obra de suspense "Another", rejeita títulos isekai/frases em inglês contendo "another world", "in another", etc.
    if (lower.includes('another world') || lower.includes('in another') || lower.includes('to another') || lower.includes('with another')) {
      return false;
    }
    // Deve conter a palavra exata com limite de palavra
    return /\banother\b/i.test(lower);
  }

  // Se a raiz tem apenas 1 palavra curta/comum (ex: "monster", "free", "nana")
  if (rootWords.length === 1 && rootWords[0].length <= 5) {
    const singleWord = rootWords[0];
    const regex = new RegExp(`\\b${singleWord}\\b`, 'i');
    return regex.test(lower);
  }

  // Pelo menos 1 palavra chave da raiz deve bater com limite de palavra
  const matchedWords = rootWords.filter(w => {
    const regex = new RegExp(`\\b${w}\\b`, 'i');
    return regex.test(lower);
  });
  return matchedWords.length > 0;
}

/**
 * Busca Recursiva em Tempo Real da Árvore Genealógica de Franquia (AniList GraphQL Avançado)
 * Combina busca direta por nó + busca abrangente de franquia + exploração bidimensional em grafo (BFS).
 * Percorre prequels e sequels para frente e para trás sem parar em profundidade única.
 */
export async function fetchAnimeFranchiseTree(
  searchQueryOrMalId: string | number,
  exactTitle?: string
): Promise<{
  rootTitle: string;
  franchiseIds: number[];
  items: FranchiseTreeItem[];
  activeAiringDay?: string | null;
  candidateFranchises?: FranchiseCandidate[];
}> {
  let resolvedMalId: number | null = typeof searchQueryOrMalId === 'number' || /^\d+$/.test(String(searchQueryOrMalId))
    ? Number(searchQueryOrMalId)
    : null;
  let resolvedSearchTitle = exactTitle || String(searchQueryOrMalId);

  // Pré-resolução inteligente: se não temos mal_id direto, busca metadados tolerante a erros de digitação
  if (!resolvedMalId && resolvedSearchTitle.trim().length >= 2) {
    try {
      const candidates = await searchAnimeMetadata(resolvedSearchTitle.trim());
      if (candidates && candidates.length > 0) {
        const top = candidates[0];
        if (top.mal_id) {
          resolvedMalId = top.mal_id;
        }
        if (top.title && !exactTitle) {
          resolvedSearchTitle = top.title;
        }
      }
    } catch (e) {
      console.warn('Pré-resolução fuzzy preliminar falhou:', e);
    }
  }

  const rawSearch = resolvedSearchTitle;
  const rootTitle = getFranchiseRootTitle(rawSearch);

  const rootKeywords = rootTitle
    .split(' ')
    .filter(w => w.length >= 3 && !['the', 'and', 'arc', 'hen', 'kara', 'ittara'].includes(w));

  try {
    const isId = resolvedMalId !== null;
    
    // Consulta GraphQL combinada: Busca o Nó Principal com Relações E a Página Completa da Franquia
    const combinedGraphqlQuery = `
      query ($idMal: Int, $search: String, $rootSearch: String) {
        targetMedia: Media(idMal: $idMal, search: $search, type: ANIME) {
          id
          idMal
          title {
            romaji
            english
            native
          }
          status
          nextAiringEpisode {
            airingAt
          }
          format
          episodes
          seasonYear
          startDate {
            year
            month
            day
          }
          coverImage {
            large
            medium
          }
          relations {
            edges {
              relationType
              node {
                id
                idMal
                title {
                  romaji
                  english
                  native
                }
                status
                nextAiringEpisode {
                  airingAt
                }
                format
                episodes
                seasonYear
                startDate {
                  year
                  month
                  day
                }
                coverImage {
                  large
                  medium
                }
              }
            }
          }
        }

        franchiseSearch: Page(page: 1, perPage: 35) {
          media(search: $rootSearch, type: ANIME, sort: [START_DATE, POPULARITY_DESC]) {
            id
            idMal
            title {
              romaji
              english
              native
            }
            status
            nextAiringEpisode {
              airingAt
            }
            format
            episodes
            seasonYear
            startDate {
              year
              month
              day
            }
            coverImage {
              large
              medium
            }
            relations {
              edges {
                relationType
                node {
                  id
                  idMal
                  title {
                    romaji
                    english
                    native
                  }
                  status
                  nextAiringEpisode {
                    airingAt
                  }
                  format
                  episodes
                  seasonYear
                  startDate {
                    year
                  }
                  coverImage {
                    large
                    medium
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables: any = {
      rootSearch: rootTitle || rawSearch,
    };

    if (isId && resolvedMalId) {
      variables.idMal = resolvedMalId;
    } else {
      variables.search = rawSearch.trim();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: combinedGraphqlQuery, variables }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json();
      const targetMedia = json?.data?.targetMedia;
      const franchiseList: any[] = json?.data?.franchiseSearch?.media || [];

      // Mapeamento em Grafo para agrupar e desduplicar
      const nodesMap = new Map<number, any>();
      const idsSet = new Set<number>();
      let detectedAiringDay: string | null = null;

      // Função auxiliar para registrar nós válidos
      const processNode = (node: any, relationTypeHint?: string, isDirectRelation = false) => {
        if (!node) return;
        const formatUpper = (node.format || '').toUpperCase();
        
        // 1. Filtro estrito: APENAS mídias audiovisuais (exclui Mangá, Novel, One Shot, Música)
        if (!ALLOWED_AUDIOVISUAL_FORMATS.has(formatUpper)) {
          return;
        }

        const malId = node.idMal || node.id;
        if (!malId) return;

        // Detecta dia de transmissão se a temporada estiver ativamente no ar (RELEASING)
        const isCurrentlyReleasing = node.status === 'RELEASING';
        if (isCurrentlyReleasing && node.nextAiringEpisode?.airingAt && !detectedAiringDay) {
          try {
            const airingDate = new Date(node.nextAiringEpisode.airingAt * 1000);
            const formatter = new Intl.DateTimeFormat('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              weekday: 'long',
            });
            const weekdayRaw = formatter.format(airingDate).toLowerCase();
            const DAY_NAMES = [
              'Domingo',
              'Segunda-feira',
              'Terça-feira',
              'Quarta-feira',
              'Quinta-feira',
              'Sexta-feira',
              'Sábado',
            ];
            const matched = DAY_NAMES.find(
              (d) => d.toLowerCase() === weekdayRaw || weekdayRaw.includes(d.toLowerCase())
            );
            detectedAiringDay = matched || DAY_NAMES[airingDate.getDay()];
          } catch (e) {
            console.warn('Erro ao formatar dia de transmissão da franquia:', e);
          }
        }

        const romaji = node.title?.romaji || '';
        const english = node.title?.english || '';
        const bestTitle = romaji || english || node.title?.native || 'Obra';

        // 2. Filtro de relevância de franquia para itens vindos de busca textual livre
        if (!isDirectRelation && rootKeywords.length > 0 && !isRelevantFranchiseNode(`${bestTitle} ${english}`, rootKeywords, rootTitle)) {
          return;
        }

        idsSet.add(malId);
        if (node.id) idsSet.add(node.id);

        if (!nodesMap.has(malId)) {
          nodesMap.set(malId, {
            id: malId,
            aniListId: node.id,
            title: bestTitle,
            japaneseTitle: node.title?.native,
            englishTitle: english,
            format: formatUpper,
            episodes: node.episodes || null,
            seasonYear: node.seasonYear || node.startDate?.year || null,
            startDate: node.startDate || null,
            coverUrl: node.coverImage?.large || node.coverImage?.medium,
            relationType: relationTypeHint || 'main',
          });
        }
      };

      // Grafo de conexões canônicas para agrupamento inteligente de franquias
      const adjacencyList = new Map<number, Set<number>>();
      const addGraphEdge = (u: number, v: number) => {
        if (!u || !v || u === v) return;
        if (!adjacencyList.has(u)) adjacencyList.set(u, new Set());
        if (!adjacencyList.has(v)) adjacencyList.set(v, new Set());
        adjacencyList.get(u)!.add(v);
        adjacencyList.get(v)!.add(u);
      };

      // Fila de expansão bidimensional (BFS)
      const exploredAniListIds = new Set<number>();
      const pendingAniListIds = new Set<number>();

      const registerRelationEdges = (edges: any[], sourceMalId?: number) => {
        if (!Array.isArray(edges)) return;
        edges.forEach((edge: any) => {
          const edgeType = (edge.relationType || '').toUpperCase();
          if (VALID_RELATION_TYPES.has(edgeType) && edge.node) {
            processNode(edge.node, edgeType.toLowerCase(), true);
            const targetMalId = edge.node.idMal || edge.node.id;
            if (sourceMalId && targetMalId) {
              addGraphEdge(sourceMalId, targetMalId);
            }
            if (edge.node.id && !exploredAniListIds.has(edge.node.id)) {
              pendingAniListIds.add(edge.node.id);
            }
          }
        });
      };

      // 1. Processa o nó alvo pesquisado
      if (targetMedia) {
        if (targetMedia.id) exploredAniListIds.add(targetMedia.id);
        processNode(targetMedia, 'main', true);
        if (targetMedia.relations?.edges) {
          registerRelationEdges(targetMedia.relations.edges, targetMedia.idMal || targetMedia.id);
        }
      }

      // 2. Processa os nós encontrados na busca abrangente da franquia
      franchiseList.forEach((mediaItem) => {
        if (mediaItem.id) exploredAniListIds.add(mediaItem.id);
        processNode(mediaItem, 'main', false);
        if (mediaItem.relations?.edges) {
          registerRelationEdges(mediaItem.relations.edges, mediaItem.idMal || mediaItem.id);
        }
      });

      // 3. BUSCA BIDIMENSIONAL COMPLETA (BFS):
      // Percorre prequels (para trás) e sequels (para frente) em profundidade.
      // Se um anime tem 10 ou 19 temporadas, expande recursivamente todos os elos da cadeia.
      let expansionRounds = 0;
      const MAX_EXPANSION_ROUNDS = 4; // 4 rodadas cobrem cadeias de mais de 20 temporadas conectadas
      while (pendingAniListIds.size > 0 && expansionRounds < MAX_EXPANSION_ROUNDS) {
        expansionRounds++;
        const currentBatch = Array.from(pendingAniListIds).slice(0, 45);
        currentBatch.forEach((id) => {
          pendingAniListIds.delete(id);
          exploredAniListIds.add(id);
        });

        if (currentBatch.length === 0) break;

        try {
          const batchQuery = `
            query ($ids: [Int]) {
              Page(page: 1, perPage: 50) {
                media(id_in: $ids, type: ANIME) {
                  id
                  idMal
                  title {
                    romaji
                    english
                    native
                  }
                  status
                  nextAiringEpisode {
                    airingAt
                  }
                  format
                  episodes
                  seasonYear
                  startDate {
                    year
                    month
                    day
                  }
                  coverImage {
                    large
                    medium
                  }
                  relations {
                    edges {
                      relationType
                      node {
                        id
                        idMal
                        title {
                          romaji
                          english
                          native
                        }
                        status
                        format
                        episodes
                        seasonYear
                        startDate {
                          year
                          month
                          day
                        }
                        coverImage {
                          large
                          medium
                        }
                      }
                    }
                  }
                }
              }
            }
          `;

          const bController = new AbortController();
          const bTimeout = setTimeout(() => bController.abort(), 6000);
          const bRes = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ query: batchQuery, variables: { ids: currentBatch } }),
            signal: bController.signal,
          });
          clearTimeout(bTimeout);

          if (bRes.ok) {
            const bJson = await bRes.json();
            const batchMedia: any[] = bJson?.data?.Page?.media || [];
            batchMedia.forEach((m) => {
              if (m.id) exploredAniListIds.add(m.id);
              processNode(m, 'sequel', true);
              if (m.relations?.edges) {
                registerRelationEdges(m.relations.edges, m.idMal || m.id);
              }
            });
          }
        } catch (bErr) {
          console.warn('Erro na expansão bidimensional BFS da franquia:', bErr);
          break;
        }
      }

      const collectedList = Array.from(nodesMap.values());

      if (collectedList.length > 0) {
        // Ordenação cronológica estrita por ano/mês/dia
        collectedList.sort((a, b) => {
          const yearA = a.startDate?.year || a.seasonYear || 9999;
          const yearB = b.startDate?.year || b.seasonYear || 9999;
          if (yearA !== yearB) return yearA - yearB;

          const monthA = a.startDate?.month || 1;
          const monthB = b.startDate?.month || 1;
          if (monthA !== monthB) return monthA - monthB;

          const dayA = a.startDate?.day || 1;
          const dayB = b.startDate?.day || 1;
          return dayA - dayB;
        });

        // Agrupamento por Franquias Conexas (Connected Components Graph Clustering)
        // Se duas mídias possuem conexões canônicas (sequels, prequels, spin-offs, movies), pertencem à mesma franquia.
        const visitedForClusters = new Set<number>();
        const rawClusters: {
          representative: any;
          nodes: any[];
        }[] = [];

        const nonGenericRoot = (rootTitle || '').trim().toLowerCase();
        const isGenericRoot =
          !nonGenericRoot ||
          ['another', 'monster', 'free', 'nana', 'orange', 'k-on'].includes(nonGenericRoot) ||
          nonGenericRoot.length < 4;

        // Conecta itens que compartilham o mesmo rootTitle canônico longo/específico
        if (!isGenericRoot) {
          for (let i = 0; i < collectedList.length; i++) {
            for (let j = i + 1; j < collectedList.length; j++) {
              const rootI = getFranchiseRootTitle(collectedList[i].title).toLowerCase();
              const rootJ = getFranchiseRootTitle(collectedList[j].title).toLowerCase();
              if (rootI && rootI === rootJ) {
                addGraphEdge(collectedList[i].id, collectedList[j].id);
              }
            }
          }
        }

        collectedList.forEach((node) => {
          if (visitedForClusters.has(node.id)) return;

          const clusterNodes: any[] = [];
          const queue: number[] = [node.id];
          visitedForClusters.add(node.id);

          while (queue.length > 0) {
            const currentId = queue.shift()!;
            const currentNode = nodesMap.get(currentId);
            if (currentNode) clusterNodes.push(currentNode);

            const neighbors = adjacencyList.get(currentId);
            if (neighbors) {
              neighbors.forEach((nbrId) => {
                if (!visitedForClusters.has(nbrId) && nodesMap.has(nbrId)) {
                  visitedForClusters.add(nbrId);
                  queue.push(nbrId);
                }
              });
            }
          }

          if (clusterNodes.length > 0) {
            // Eleição do nó representativo do cluster
            clusterNodes.sort((a, b) => {
              const titleA = (a.title || '').toLowerCase().trim();
              const titleB = (b.title || '').toLowerCase().trim();
              const searchLower = rawSearch.toLowerCase().trim();

              const exactA = titleA === searchLower ? 2 : titleA.startsWith(searchLower) ? 1 : 0;
              const exactB = titleB === searchLower ? 2 : titleB.startsWith(searchLower) ? 1 : 0;
              if (exactA !== exactB) return exactB - exactA;

              const tvA = a.format === 'TV' ? 1 : 0;
              const tvB = b.format === 'TV' ? 1 : 0;
              if (tvA !== tvB) return tvB - tvA;

              const yearA = a.startDate?.year || a.seasonYear || 9999;
              const yearB = b.startDate?.year || b.seasonYear || 9999;
              return yearA - yearB;
            });

            rawClusters.push({
              representative: clusterNodes[0],
              nodes: clusterNodes,
            });
          }
        });

        // Ordena os clusters pelo grau de relevância em relação ao termo pesquisado
        rawClusters.sort((cA, cB) => {
          const titleA = (cA.representative.title || '').toLowerCase().trim();
          const titleB = (cB.representative.title || '').toLowerCase().trim();
          const searchLower = rawSearch.toLowerCase().trim();

          const exactA = titleA === searchLower ? 3 : titleA.startsWith(searchLower) ? 2 : 0;
          const exactB = titleB === searchLower ? 3 : titleB.startsWith(searchLower) ? 2 : 0;
          if (exactA !== exactB) return exactB - exactA;

          const tvA = cA.representative.format === 'TV' ? 1 : 0;
          const tvB = cB.representative.format === 'TV' ? 1 : 0;
          if (tvA !== tvB) return tvB - tvA;

          return cB.nodes.length - cA.nodes.length;
        });

        // Função de formatação cronológica de itens de um cluster
        const formatClusterItems = (nodes: any[], clusterRepTitle: string): FranchiseTreeItem[] => {
          const sorted = [...nodes].sort((a, b) => {
            const yearA = a.startDate?.year || a.seasonYear || 9999;
            const yearB = b.startDate?.year || b.seasonYear || 9999;
            if (yearA !== yearB) return yearA - yearB;
            const monthA = a.startDate?.month || 1;
            const monthB = b.startDate?.month || 1;
            if (monthA !== monthB) return monthA - monthB;
            const dayA = a.startDate?.day || 1;
            const dayB = b.startDate?.day || 1;
            return dayA - dayB;
          });

          return sorted.map((item, idx) => {
            let mappedFormat: FranchiseTreeItem['format'] = 'TV';
            if (item.format === 'MOVIE') mappedFormat = 'Movie';
            else if (item.format === 'OVA') mappedFormat = 'OVA';
            else if (item.format === 'ONA') mappedFormat = 'ONA';
            else if (item.format === 'SPECIAL') mappedFormat = 'Special';

            let mappedRelation: FranchiseTreeItem['relationType'] = 'sequel';
            if (idx === 0) mappedRelation = 'main';
            else if (mappedFormat === 'Movie') mappedRelation = 'movie';
            else if (mappedFormat === 'OVA') mappedRelation = 'ova';

            return {
              id: item.id,
              title: formatMediaTitlePT(item.title, item.format, idx, clusterRepTitle),
              japaneseTitle: item.japaneseTitle,
              englishTitle: item.englishTitle,
              format: mappedFormat,
              episodes: item.episodes,
              seasonYear: item.seasonYear,
              coverUrl: item.coverUrl,
              relationType: mappedRelation,
              order: idx + 1,
            };
          });
        };

        // Candidatos de franquia identificados se a busca retornou obras distintas
        const candidateFranchises: FranchiseCandidate[] = rawClusters.map((c) => {
          const formattedItems = formatClusterItems(c.nodes, c.representative.title);
          const cIds = c.nodes.map((n) => n.id);
          return {
            clusterId: c.representative.id,
            title: c.representative.title,
            year: c.representative.seasonYear || c.representative.startDate?.year || null,
            format: c.representative.format,
            coverUrl: c.representative.coverUrl,
            itemCount: formattedItems.length,
            items: formattedItems,
            franchiseIds: cIds,
          };
        });

        // Se houver mais de 1 cluster distinto (ex: busca por nome comum como "Another" que retornou múltiplos animes não relacionados),
        // expõe os candidatos para desambiguação e seleciona a franquia primária por padrão.
        if (candidateFranchises.length > 1) {
          const primaryCluster = candidateFranchises[0];
          return {
            rootTitle: primaryCluster.title || rootTitle || rawSearch,
            franchiseIds: primaryCluster.franchiseIds,
            items: primaryCluster.items,
            activeAiringDay: detectedAiringDay || null,
            candidateFranchises: candidateFranchises.slice(0, 8),
          };
        }

        // Caso padrão (obra bem estabelecida com 1 única franquia conectada): não gera candidatos extras
        const primaryItems = formatClusterItems(collectedList, rootTitle || rawSearch);
        return {
          rootTitle: rootTitle || rawSearch,
          franchiseIds: Array.from(idsSet),
          items: primaryItems,
          activeAiringDay: detectedAiringDay || null,
          candidateFranchises: undefined,
        };
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar árvore AniList recursiva:', err);
  }

  return {
    rootTitle: rootTitle || exactTitle || 'Franquia',
    franchiseIds: typeof searchQueryOrMalId === 'number' ? [searchQueryOrMalId] : [],
    items: [],
    activeAiringDay: null,
  };
}

/**
 * Converte a Árvore de Franquias ou Arcos selecionada pelo usuário em temporadas (`AnimeSeasonOrArc[]`)
 * Permite marcar tudo como assistido até a temporada/arco atual com 1 toque!
 */
export function buildSeasonsFromFranchiseSelection(
  items: FranchiseTreeItem[],
  currentSelectedId: number | string,
  markPreviousAsWatched: boolean = true
): {
  seasons: AnimeSeasonOrArc[];
  currentSeasonName: string;
  activeTotalEpisodes: number | null;
} {
  if (!items || items.length === 0) {
    return {
      seasons: [{ id: 's1', name: 'Temporada 1', order: 1, totalEpisodes: null, isWatched: false }],
      currentSeasonName: 'Temporada 1',
      activeTotalEpisodes: null,
    };
  }

  let activeIndex = -1;

  // Localiza o índice do item atual
  items.forEach((item, idx) => {
    if (String(item.id) === String(currentSelectedId)) {
      activeIndex = idx;
    }
  });

  if (activeIndex === -1) activeIndex = 0;

  const currentItem = items[activeIndex];
  const currentSeasonName = currentItem ? currentItem.title : 'Temporada 1';
  const activeTotalEpisodes = currentItem?.episodes || null;

  const seasons: AnimeSeasonOrArc[] = items.map((item, idx) => {
    const isPast = idx < activeIndex;
    const name = item.title;
    const epCount = item.episodes || null;
    const malId = typeof item.id === 'number' ? item.id : undefined;
    const canonicalTitle = item.japaneseTitle || item.englishTitle || item.title;
    const type = item.format ? (item.format.toLowerCase() as any) : 'tv';
    const releaseYear = item.seasonYear || null;

    const sObj: AnimeSeasonOrArc = {
      id: `sec_${idx + 1}_${malId || (idx + 1)}`,
      name,
      order: idx + 1,
      isWatched: markPreviousAsWatched ? isPast : false,
      totalEpisodes: epCount || null,
      releaseYear: releaseYear || null,
    };

    if (canonicalTitle) sObj.canonicalTitle = canonicalTitle;
    if (malId !== undefined && malId !== null) sObj.mal_id = malId;
    if (type) sObj.type = type;

    return sObj;
  });

  return {
    seasons,
    currentSeasonName,
    activeTotalEpisodes: activeTotalEpisodes || null,
  };
}

/**
 * Sincroniza e detecta automaticamente novas temporadas, filmes, OVAs ou arcos para um anime existente.
 * - Preserva estritamente o nome customizado que o usuário digitou (ex: "Temporada 3" ou "Filme").
 * - Preserva a temporada ativa e o progresso de episódios intactos.
 * - Anexa novidades canônicas inéditas no final da lista como isWatched: false.
 */
export async function syncFranchiseSeasonsForAnime(
  anime: Anime
): Promise<{
  hasNewSeasons: boolean;
  newSeasonsCount: number;
  updatedSeasons: AnimeSeasonOrArc[];
  newFranchiseIds: number[];
  latestBroadcastDay?: string | null;
}> {
  if (!anime) {
    return { hasNewSeasons: false, newSeasonsCount: 0, updatedSeasons: [], newFranchiseIds: [] };
  }

  const currentSeasons: AnimeSeasonOrArc[] = Array.isArray(anime.seasons) ? [...anime.seasons] : [];
  const searchKey = anime.mal_id || anime.franchiseTitle || anime.title;

  try {
    const tree = await fetchAnimeFranchiseTree(searchKey, anime.title);
    if (!tree.items || tree.items.length === 0) {
      return {
        hasNewSeasons: false,
        newSeasonsCount: 0,
        updatedSeasons: currentSeasons,
        newFranchiseIds: anime.franchiseIds || [],
      };
    }

    let hasNewItems = false;
    let newItemsAdded = 0;
    const updatedSeasons: AnimeSeasonOrArc[] = [...currentSeasons];

    const effectiveMode: 'seasons' | 'arcs' = anime.structureMode || (
      currentSeasons.some((s) => s.type === 'arc' || s.name.toLowerCase().includes('arco')) ? 'arcs' : 'seasons'
    );

    const excludedNorm = (anime.excludedFranchiseItems || []).map((x) => String(x).toLowerCase().trim());
    const isExcluded = (id: number | string | undefined, titles: (string | undefined | null)[]) => {
      if (!excludedNorm.length) return false;
      if (id !== undefined && id !== null) {
        const strId = String(id).toLowerCase().trim();
        if (excludedNorm.includes(strId)) return true;
        if (excludedNorm.some((ex) => ex.includes(strId) || strId.includes(ex))) return true;
      }
      return titles.some((t) => {
        if (!t) return false;
        const normT = t.toLowerCase().trim();
        return excludedNorm.some((ex) => {
          if (ex === normT) return true;
          if (ex.length >= 4 && (normT.includes(ex) || ex.includes(normT))) return true;
          return false;
        });
      });
    };

    const doesItemMatchSeason = (item: { id: number; title: string; englishTitle?: string; format?: string }, s: AnimeSeasonOrArc): boolean => {
      if (s.mal_id && s.mal_id === item.id) return true;
      const itemTitleNorm = item.title.toLowerCase().trim();
      const itemEngNorm = item.englishTitle ? item.englishTitle.toLowerCase().trim() : '';
      const canonNorm = s.canonicalTitle ? s.canonicalTitle.toLowerCase().trim() : '';
      const sNameNorm = s.name ? s.name.toLowerCase().trim() : '';

      if (canonNorm && (canonNorm === itemTitleNorm || (itemEngNorm && canonNorm === itemEngNorm))) return true;
      if (sNameNorm && (sNameNorm === itemTitleNorm || (itemEngNorm && sNameNorm === itemEngNorm))) return true;

      const itemNum = (item.title + ' ' + (item.englishTitle || '')).match(/(?:temporada|season|part|\b)(\d+)/i)?.[1];
      const sNum = (s.canonicalTitle || s.name).match(/(?:temporada|season|parte|\b)(\d+)/i)?.[1];
      if (itemNum && sNum && itemNum === sNum) {
        const itemIsOva = item.format === 'OVA' || item.format === 'Special' || /ova|special/i.test(item.title);
        const sIsOva = /ova|special/i.test(s.canonicalTitle || s.name);
        if (itemIsOva === sIsOva) return true;
      }

      if (canonNorm.length >= 6 && (itemTitleNorm.includes(canonNorm) || canonNorm.includes(itemTitleNorm))) return true;
      if (sNameNorm.length >= 6 && (itemTitleNorm.includes(sNameNorm) || sNameNorm.includes(itemTitleNorm))) return true;

      return false;
    };

    // 1. Atualiza metadados das temporadas existentes que o usuário possui
      for (let existingIdx = 0; existingIdx < updatedSeasons.length; existingIdx++) {
        const oldSeason = updatedSeasons[existingIdx];
        const matchItem = tree.items.find((item) => doesItemMatchSeason(item, oldSeason));
        if (matchItem) {
          let hasSeasonChanges = false;
          const patchedSeason = { ...oldSeason };
          if (!patchedSeason.mal_id && typeof matchItem.id === 'number') {
            patchedSeason.mal_id = matchItem.id;
            hasSeasonChanges = true;
          }
          if (!patchedSeason.canonicalTitle) {
            patchedSeason.canonicalTitle = matchItem.title;
            hasSeasonChanges = true;
          }
          if (!patchedSeason.type && matchItem.format) {
            patchedSeason.type = matchItem.format.toLowerCase() as any;
            hasSeasonChanges = true;
          }
          if (matchItem.episodes && matchItem.episodes !== patchedSeason.totalEpisodes) {
            patchedSeason.totalEpisodes = matchItem.episodes;
            hasSeasonChanges = true;
          }
          if (matchItem.seasonYear && !patchedSeason.releaseYear) {
            patchedSeason.releaseYear = matchItem.seasonYear;
            hasSeasonChanges = true;
          }
          if (hasSeasonChanges) {
            updatedSeasons[existingIdx] = patchedSeason;
            hasNewItems = true;
          }
        }
      }

      // 2. Se o usuário já possui temporadas salvas, só adiciona temporadas estritamente FUTURAS
      if (currentSeasons.length > 0) {
        let maxMatchedItemIdx = -1;
        tree.items.forEach((item, idx) => {
          if (currentSeasons.some((s) => doesItemMatchSeason(item, s))) {
            maxMatchedItemIdx = Math.max(maxMatchedItemIdx, idx);
          }
        });

        const startIdx = maxMatchedItemIdx >= 0 ? maxMatchedItemIdx + 1 : tree.items.length;
        for (let i = startIdx; i < tree.items.length; i++) {
          const item = tree.items[i];
          if (isExcluded(item.id, [item.title, item.englishTitle])) continue;
          if (item.format === 'OVA' || item.format === 'Special') continue;
          if (/ova|special|especial/i.test(item.title)) continue;

          const nextOrder = updatedSeasons.length + 1;
          const newSeason: AnimeSeasonOrArc = {
            id: `sec-${Date.now()}_${item.id}_${nextOrder}`,
            name: item.title,
            canonicalTitle: item.title,
            mal_id: item.id,
            type: item.format ? (item.format.toLowerCase() as any) : 'tv',
            releaseYear: item.seasonYear || null,
            totalEpisodes: item.episodes || null,
            order: nextOrder,
            isWatched: false,
          };
          updatedSeasons.push(newSeason);
          hasNewItems = true;
          newItemsAdded++;
        }
      }

    const mergedFranchiseIds = Array.from(
      new Set([
        ...(anime.franchiseIds || []),
        ...(tree.franchiseIds || []),
        ...updatedSeasons.map((s) => s.mal_id).filter((id): id is number => typeof id === 'number' && id > 0),
      ])
    );

    return {
      hasNewSeasons: hasNewItems,
      newSeasonsCount: newItemsAdded,
      updatedSeasons,
      newFranchiseIds: mergedFranchiseIds,
      latestBroadcastDay: tree.activeAiringDay || anime.broadcastDay || null,
    };
  } catch (err) {
    console.warn('Erro ao sincronizar temporadas da franquia:', err);
    return {
      hasNewSeasons: false,
      newSeasonsCount: 0,
      updatedSeasons: currentSeasons,
      newFranchiseIds: anime.franchiseIds || [],
    };
  }
}

/**
 * Verifica se dois animes pertencem à mesma franquia (cruzamento de ID, franchiseIds ou título raiz)
 * Prioridade absoluta para IDs (mal_id, franchiseIds). Para títulos, impede falsos positivos em nomes comuns (ex: "Another").
 */
export function checkIsSameFranchise(
  userAnime: { mal_id?: number | null; franchiseIds?: number[]; franchiseTitle?: string; title: string; japaneseTitle?: string },
  candidate: { id?: number | string; mal_id?: number | string; title: string; title_japanese?: string; title_english?: string }
): boolean {
  if (!userAnime || !candidate) return false;

  const candId = Number(candidate.id || candidate.mal_id);

  // 1. Match por ID exato
  if (userAnime.mal_id && candId && userAnime.mal_id === candId) {
    return true;
  }

  // 2. Match por Franchise IDs unificados
  if (candId && userAnime.franchiseIds && userAnime.franchiseIds.includes(candId)) {
    return true;
  }

  // Helper para proteção contra palavras genéricas/curtas que jamais devem aceitar substring
  const isGenericShortWord = (r: string) => {
    if (!r || r.length <= 4) return true;
    const COMMON_WORDS = new Set(['another', 'monster', 'nana', 'free', 'orange', 'major', 'clannad', 'shiki', 'given', 'solo', 'alive', 'blood', 'reset', 'restart', 'world', 'story']);
    return COMMON_WORDS.has(r);
  };

  const isSafeTitleMatch = (u: string, c: string): boolean => {
    if (!u || !c) return false;
    if (u === c) return true;
    if (isGenericShortWord(u) || isGenericShortWord(c)) return false;
    if (u.length >= 6 && (c.startsWith(u + ':') || c.startsWith(u + ' -') || c.startsWith(u + ' –'))) return true;
    if (c.length >= 6 && (u.startsWith(c + ':') || u.startsWith(c + ' -') || u.startsWith(c + ' –'))) return true;
    return false;
  };

  // 3. Match por Raiz de Franquia (unificada pelo normalizador)
  const uRoot = (userAnime.franchiseTitle || getFranchiseRootTitle(userAnime.title)).toLowerCase().trim();
  const cRoot = getFranchiseRootTitle(candidate.title).toLowerCase().trim();
  const cEngRoot = candidate.title_english ? getFranchiseRootTitle(candidate.title_english).toLowerCase().trim() : '';

  if (uRoot && cRoot && isSafeTitleMatch(uRoot, cRoot)) {
    return true;
  }

  if (uRoot && cEngRoot && isSafeTitleMatch(uRoot, cEngRoot)) {
    return true;
  }

  // 4. Match por Título Japonês exato
  if (userAnime.japaneseTitle && candidate.title_japanese) {
    const uj = userAnime.japaneseTitle.toLowerCase().trim();
    const cj = candidate.title_japanese.toLowerCase().trim();
    if (uj === cj) {
      return true;
    }
  }

  // 5. Match cruzado entre título customizado do usuário e títulos oficiais
  const uCustomTitle = userAnime.title.toLowerCase().trim();
  if (candidate.title_english) {
    const cEng = candidate.title_english.toLowerCase().trim();
    if (uCustomTitle === cEng && !isGenericShortWord(uCustomTitle)) {
      return true;
    }
  }

  return false;
}
