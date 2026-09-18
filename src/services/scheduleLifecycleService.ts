/**
 * Motor de Ciclo de Vida Automatizado da Agenda (WAnimeList)
 *
 * 1. Transição Automática:
 *    - Obras de "Próxima Temporada" que atingem a data de estreia migram automaticamente para "Em Exibição".
 *    - Obras em "Em Exibição" que transmitem o último episódio da temporada saem automaticamente do calendário semanal.
 *    - Novas produções cadastradas nas APIs entram automaticamente em "Próxima Temporada".
 *
 * 2. Previsão de Lançamento 100% Fiel às APIs:
 *    - Dia + Mês + Ano: "12 de Outubro de 2026"
 *    - Mês + Ano: "Outubro de 2026"
 *    - Estação + Ano: "Temporada de Outono de 2026"
 *    - Apenas Ano: "Previsão: 2026"
 *    - Sem data confirmada: "Aguardando data oficial de estreia"
 */

import type { ScheduleAnimeItem } from './jikanService';
import { formatAiringAtToBrazil } from './jikanService';

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const SEASON_TRANSLATION_MAP: Record<string, string> = {
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Verão',
  FALL: 'Outono',
  winter: 'Inverno',
  spring: 'Primavera',
  summer: 'Verão',
  fall: 'Outono',
};

/**
 * Formata de maneira estrita a previsão de estreia com base única e exclusivamente
 * nos dados fornecidos pelas APIs oficiais, sem dedução ou especulação.
 */
export function formatUpcomingReleaseForecast(
  startDate?: { year?: number; month?: number; day?: number } | null,
  season?: string | null,
  year?: number | null,
  airingAtSeconds?: number | null
): { text: string; hasConfirmedDate: boolean; precision: 'day' | 'month' | 'season' | 'year' | 'unknown' } {
  let startYear = startDate?.year;
  let startMonth = startDate?.month;
  let startDay = startDate?.day;

  // Se a API disponibilizar timestamp do episódio 1 e startDate não tiver o dia completo
  if ((!startYear || !startMonth || !startDay) && airingAtSeconds && airingAtSeconds > 0) {
    try {
      const airingDate = new Date(airingAtSeconds * 1000);
      const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
      }).formatToParts(airingDate);

      const d = Number(parts.find((p) => p.type === 'day')?.value);
      const m = Number(parts.find((p) => p.type === 'month')?.value);
      const y = Number(parts.find((p) => p.type === 'year')?.value);

      if (d && m && y) {
        startDay = d;
        startMonth = m;
        startYear = y;
      }
    } catch {}
  }

  // 1. Data completa: Dia, Mês e Ano
  if (startYear && startMonth && startDay) {
    const monthIndex = startMonth - 1;
    const monthName = MONTHS_PT[monthIndex] || String(startMonth);
    return {
      text: `${String(startDay).padStart(2, '0')} de ${monthName} de ${startYear}`,
      hasConfirmedDate: true,
      precision: 'day',
    };
  }

  // 2. Data parcial: Mês e Ano
  if (startYear && startMonth) {
    const monthIndex = startMonth - 1;
    const monthName = MONTHS_PT[monthIndex] || String(startMonth);
    return {
      text: `${monthName} de ${startYear}`,
      hasConfirmedDate: true,
      precision: 'month',
    };
  }

  // 3. Estação do Ano e Ano (ex.: Outono de 2026)
  if (season && (year || startYear)) {
    const finalYear = year || startYear;
    const seasonPt = SEASON_TRANSLATION_MAP[season.toUpperCase()] || season;
    return {
      text: `Temporada de ${seasonPt} de ${finalYear}`,
      hasConfirmedDate: true,
      precision: 'season',
    };
  }

  // 4. Apenas o Ano
  if (year || startYear) {
    const finalYear = year || startYear;
    return {
      text: `Previsão: ${finalYear}`,
      hasConfirmedDate: true,
      precision: 'year',
    };
  }

  // 5. Sem previsão definida ainda pelas produtoras nas APIs
  return {
    text: 'Aguardando data oficial de estreia',
    hasConfirmedDate: false,
    precision: 'unknown',
  };
}

/**
 * Verifica se um anime encerrou sua temporada de exibição (deve sair do calendário semanal e de Em Exibição).
 * Não altera nem interfere nos status que o usuário escolheu para sua própria lista.
 */
export function hasAnimeConcludedSeason(item: ScheduleAnimeItem): boolean {
  if (!item) return false;

  const statusLower = (item.status || '').toLowerCase();
  if (statusLower.includes('finished') || statusLower.includes('completed') || statusLower === 'released') {
    return true;
  }

  // Se a API indicar que já exibiu o último episódio previsto da temporada
  if (item.episodes && item.episodes > 0 && item.nextEpisode) {
    if (item.nextEpisode.episode > item.episodes) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se um anime que estava em "Próxima Temporada" já começou a ser exibido no Japão / Brasil
 * e deve migrar imediatamente para a grade semanal de "Em Exibição".
 *
 * CRÍTICO: Animes com data futura anunciada (como Shangri-La Frontier 3rd Season com estreia em 2027)
 * NÃO começaram a transmitir e DEVEM PERMANECER na aba "Próxima Temporada".
 * Apenas no dia e horário real do lançamento do episódio 1 é que ele é promovido.
 */
export function hasAnimeStartedBroadcasting(item: ScheduleAnimeItem): boolean {
  if (!item) return false;

  const nowMs = Date.now();
  const statusLower = (item.status || '').toLowerCase().trim();

  // 1. Status explícito de não lançado / futuro
  const isNotYetReleasedStatus =
    statusLower === 'not_yet_released' ||
    statusLower === 'not yet aired' ||
    statusLower === 'upcoming' ||
    statusLower === 'to be aired';

  // 2. Se tem próximo episódio agendado com timestamp
  if (item.nextEpisode?.airingAt) {
    const airingTimeMs = item.nextEpisode.airingAt * 1000;
    const episodeNum = item.nextEpisode.episode || 1;

    // Se é o episódio 2 em diante, o episódio 1 já foi exibido!
    if (episodeNum > 1) {
      return true;
    }

    // Se é o episódio 1 (estreia da temporada):
    // SÓ começou se o timestamp de transmissão já foi atingido no relógio real!
    if (nowMs >= airingTimeMs) {
      return true;
    }

    // Se o episódio 1 é futuro, NÃO começou a transmitir
    return false;
  }

  // 3. Se tem data de estreia com dia, mês e ano
  if (item.startDate?.year && item.startDate?.month && item.startDate?.day) {
    const premiereDate = new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day, 0, 0, 0);
    // Se a data de estreia é estritamente futura, NÃO começou a transmitir
    if (nowMs < premiereDate.getTime()) {
      return false;
    }
    // Se a data já passou e o status não é explicitamente "Not yet aired"
    if (nowMs >= premiereDate.getTime() && !isNotYetReleasedStatus) {
      return true;
    }
  }

  // 4. Se o status na API virou para em exibição ativa e não é futuro
  if (
    !isNotYetReleasedStatus &&
    (statusLower.includes('releasing') ||
      statusLower.includes('currently airing') ||
      statusLower === 'ongoing')
  ) {
    return true;
  }

  return false;
}

export interface ReconciledScheduleResult {
  activeWeekly: ScheduleAnimeItem[];
  activeSeasonNow: ScheduleAnimeItem[];
  cleanUpcoming: ScheduleAnimeItem[];
}

/**
 * Reconcilia o ciclo de vida dos animes entre as listas semanais, temporada atual e futuras:
 * - Filtra os que já encerraram temporada (saem de Em Exibição e da grade semanal).
 * - Transfere os que estrearam de Próxima Temporada para Em Exibição e Grade Semanal na data/dia correto.
 * - Mantém novas obras detectadas pelas APIs e obras com datas futuras em Próxima Temporada.
 * - Não toca nos dados de rastreamento pessoal do usuário (minha lista).
 */
export function reconcileScheduleLifecycle(
  weeklyList: ScheduleAnimeItem[],
  upcomingList: ScheduleAnimeItem[],
  seasonNowList: ScheduleAnimeItem[] = []
): ReconciledScheduleResult {
  const activeWeeklyMap = new Map<number, ScheduleAnimeItem>();
  const activeSeasonNowMap = new Map<number, ScheduleAnimeItem>();
  const cleanUpcoming: ScheduleAnimeItem[] = [];

  // 1. Processa os itens semanais atuais: remove quem encerrou temporada
  for (const item of weeklyList) {
    if (hasAnimeConcludedSeason(item)) {
      continue;
    }
    activeWeeklyMap.set(item.id, item);
  }

  // 2. Processa os itens da temporada atual (Em Exibição): remove quem encerrou temporada
  for (const item of seasonNowList) {
    if (hasAnimeConcludedSeason(item)) {
      continue;
    }
    activeSeasonNowMap.set(item.id, item);
  }

  // 3. Processa os itens de Próxima Temporada
  for (const item of upcomingList) {
    // Se já começou a ser transmitido (atingiu a data/hora real de estreia):
    if (hasAnimeStartedBroadcasting(item)) {
      let broadcastDay = item.broadcastDay;
      let broadcastTime = item.broadcastTime;

      // Se tem timestamp do próximo episódio, calcula o dia do Brasil
      if (item.nextEpisode?.airingAt) {
        const formatted = formatAiringAtToBrazil(item.nextEpisode.airingAt);
        broadcastDay = formatted.day;
        broadcastTime = formatted.time || undefined;
      } else if (!broadcastDay || broadcastDay === 'Em breve' || broadcastDay === 'Outros') {
        if (item.startDate?.year && item.startDate?.month && item.startDate?.day) {
          const d = new Date(item.startDate.year, item.startDate.month - 1, item.startDate.day);
          const daysOfWeekPt = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
          broadcastDay = daysOfWeekPt[d.getDay()] || 'Outros';
        }
      }

      const promotedItem: ScheduleAnimeItem = {
        ...item,
        status: 'Currently Airing',
        broadcastDay: broadcastDay || 'Outros',
        broadcastTime,
      };

      activeWeeklyMap.set(promotedItem.id, promotedItem);
      activeSeasonNowMap.set(promotedItem.id, promotedItem);
    } else {
      // Se não começou (data futura ou indefinida), PERMANECE em Próxima Temporada!
      cleanUpcoming.push(item);
    }
  }

  return {
    activeWeekly: Array.from(activeWeeklyMap.values()),
    activeSeasonNow: Array.from(activeSeasonNowMap.values()),
    cleanUpcoming,
  };
}
