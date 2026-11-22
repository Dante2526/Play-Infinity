export type SubscriptionEventType =
  | "joined"
  | "first_subscription"
  | "renewal"
  | "reactivation"
  | "not_renewed"
  | "revoked"
  | "trial";

export type PaymentOrigin = "app" | "manual_admin" | "system";

export interface SubscriptionHistoryEntry {
  id: string;
  type: SubscriptionEventType;
  origin: PaymentOrigin;
  paymentMethod?: string;
  date: string; // ISO 8601
  monthKey: string; // "YYYY-MM"
  expirationDate?: string; // ISO 8601
  plan?: string;
  amount?: string;
  note?: string;
}

export type MonthStatusType =
  | "first_subscription"
  | "renewed"
  | "reactivated"
  | "active_coverage"
  | "not_renewed"
  | "trial_or_free";

export interface MonthTimelineItem {
  monthKey: string; // "YYYY-MM"
  monthLabel: string; // ex: "Nov/2026"
  fullMonthLabel: string; // ex: "Novembro de 2026"
  status: MonthStatusType;
  statusLabel: string;
  origin?: PaymentOrigin;
  originLabel?: string;
  eventDate?: string;
  amount?: string;
}

export interface ClientHistorySummary {
  joinedAt: string | null;
  joinedDateLabel: string;
  joinedMonthLabel: string;
  tenureLabel: string;
  firstSubscribedAt: string | null;
  firstSubscribedLabel: string;
  firstSubscribedOrigin: PaymentOrigin | null;
  lastRenewalAt: string | null;
  lastRenewalLabel: string;
  lastRenewedAgainAt: string | null;
  lastRenewedAgainLabel: string | null;
  lastPaymentOrigin: PaymentOrigin | null;
  lastPaymentOriginLabel: string;
  lastPaymentMethodLabel: string;
  monthsWithoutRenewal: string[]; // labels ex: ["Out/2026"]
  monthsWithoutRenewalKeys: string[]; // keys ex: ["2026-10"]
  monthlyTimeline: MonthTimelineItem[];
  events: SubscriptionHistoryEntry[];
  totalAppRenewals: number;
  totalManualRenewals: number;
}

const MONTH_NAMES_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

const MONTH_NAMES_FULL = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function toValidDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === "object" && val !== null && "toDate" in val && typeof (val as any).toDate === "function") {
    const d = (val as any).toDate();
    return d instanceof Date && !isNaN(d.getTime()) ? d : null;
  }
  return null;
}

export function toMonthKey(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === "string" ? toValidDate(dateOrIso) : dateOrIso;
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatMonthKeyShort(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return monthKey;
  return `${MONTH_NAMES_SHORT[monthIdx]}/${year}`;
}

export function formatMonthKeyFull(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return monthKey;
  return `${MONTH_NAMES_FULL[monthIdx]} de ${year}`;
}

export function formatDatePtBr(iso?: string | null, includeTime = false): string {
  const d = toValidDate(iso);
  if (!d) return "Não registrado";
  const datePart = d.toLocaleDateString("pt-BR");
  if (!includeTime) return datePart;
  const timePart = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} às ${timePart}`;
}

export function formatOriginLabel(origin?: PaymentOrigin | null): string {
  if (origin === "app") return "Pelo App (Asaas)";
  if (origin === "manual_admin") return "Manual (Admin)";
  if (origin === "system") return "Sistema";
  return "Não identificado";
}

export function isShortTrialPlan(plan?: string | null): boolean {
  const p = String(plan || "").toLowerCase().trim();
  return p === "30min" || p === "teste" || p === "4horas" || p === "1dia" || p === "7dias";
}

function enumerateMonthKeys(startKey: string, endKey: string): string[] {
  const s = /^(\d{4})-(\d{2})$/.exec(startKey);
  const e = /^(\d{4})-(\d{2})$/.exec(endKey);
  if (!s || !e) return startKey ? [startKey] : [];

  let curYear = parseInt(s[1], 10);
  let curMonth = parseInt(s[2], 10);
  const endYear = parseInt(e[1], 10);
  const endMonth = parseInt(e[2], 10);

  const result: string[] = [];
  let guard = 0;
  while ((curYear < endYear || (curYear === endYear && curMonth <= endMonth)) && guard < 120) {
    result.push(`${curYear}-${String(curMonth).padStart(2, "0")}`);
    curMonth++;
    if (curMonth > 12) {
      curMonth = 1;
      curYear++;
    }
    guard++;
  }
  return result;
}

function computeTenureLabel(joinedDate: Date | null, nowDate: Date): string {
  if (!joinedDate) return "Sem data de entrada";
  const monthsDiff =
    (nowDate.getFullYear() - joinedDate.getFullYear()) * 12 +
    (nowDate.getMonth() - joinedDate.getMonth());
  if (monthsDiff <= 0) {
    const days = Math.max(1, Math.floor((nowDate.getTime() - joinedDate.getTime()) / (24 * 60 * 60 * 1000)));
    return days === 1 ? "Entrou hoje (1º mês)" : `Há ${days} dias (1º mês)`;
  }
  if (monthsDiff === 1) return "Há 1 mês no app";
  return `Há ${monthsDiff} meses no app`;
}

/**
 * Cria um novo registro padronizado para o histórico de assinatura do cliente.
 */
export function createSubscriptionHistoryEntry(params: {
  type: SubscriptionEventType;
  origin: PaymentOrigin;
  date?: string;
  monthKey?: string;
  expirationDate?: string;
  plan?: string;
  amount?: string;
  paymentMethod?: string;
  note?: string;
}): SubscriptionHistoryEntry {
  const isoDate = params.date || new Date().toISOString();
  const mKey = params.monthKey || toMonthKey(isoDate);
  return {
    id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: params.type,
    origin: params.origin,
    paymentMethod:
      params.paymentMethod ||
      (params.origin === "app"
        ? "Pagamento pelo App (Asaas)"
        : params.origin === "manual_admin"
          ? "Renovação Manual (Admin)"
          : "Sistema"),
    date: isoDate,
    monthKey: mKey,
    ...(params.expirationDate ? { expirationDate: params.expirationDate } : {}),
    ...(params.plan ? { plan: params.plan } : {}),
    ...(params.amount ? { amount: params.amount } : {}),
    ...(params.note ? { note: params.note } : {}),
  };
}

/**
 * Reconstrói e consolida o histórico completo do cliente (mesmo para contas antigas
 * criadas antes da coleção subscriptionHistory existir).
 */
export function buildClientSubscriptionHistory(
  rawData: Record<string, any>,
  nowMs: number = Date.now()
): ClientHistorySummary {
  const nowDate = new Date(nowMs);
  const currentMonthKey = toMonthKey(nowDate);

  // 1. Normaliza eventos salvos em subscriptionHistory / historicoAssinatura
  const rawStored: any[] = Array.isArray(rawData.subscriptionHistory)
    ? rawData.subscriptionHistory
    : Array.isArray(rawData.historicoAssinatura)
      ? rawData.historicoAssinatura
      : [];

  const storedEvents: SubscriptionHistoryEntry[] = rawStored
    .filter((item) => item && typeof item === "object" && (item.date || item.monthKey))
    .map((item, idx) => {
      const validD = toValidDate(item.date);
      const iso = validD ? validD.toISOString() : new Date(nowMs).toISOString();
      const mKey =
        typeof item.monthKey === "string" && /^\d{4}-\d{2}$/.test(item.monthKey)
          ? item.monthKey
          : toMonthKey(iso);
      const origin: PaymentOrigin =
        item.origin === "app" || item.origin === "manual_admin" || item.origin === "system"
          ? item.origin
          : "manual_admin";
      const type: SubscriptionEventType =
        item.type === "joined" ||
        item.type === "first_subscription" ||
        item.type === "renewal" ||
        item.type === "reactivation" ||
        item.type === "not_renewed" ||
        item.type === "revoked" ||
        item.type === "trial"
          ? item.type
          : "renewal";
      return {
        id: typeof item.id === "string" && item.id ? item.id : `stored_${idx}_${mKey}`,
        type,
        origin,
        paymentMethod:
          typeof item.paymentMethod === "string" && item.paymentMethod
            ? item.paymentMethod
            : formatOriginLabel(origin),
        date: iso,
        monthKey: mKey,
        expirationDate: typeof item.expirationDate === "string" ? item.expirationDate : undefined,
        plan: typeof item.plan === "string" ? item.plan : undefined,
        amount: typeof item.amount === "string" ? item.amount : undefined,
        note: typeof item.note === "string" ? item.note : undefined,
      };
    });

  // 2. Datas base do documento do cliente
  const createdDate = toValidDate(rawData.criadoEm || rawData.createdAt);
  const paymentDate = toValidDate(rawData.dataPagamento || rawData.paymentDate);
  const asaasPaymentDate = toValidDate(rawData.asaasPaymentDate);
  const explicitFirstSub = toValidDate(rawData.firstSubscribedAt || rawData.primeiraAssinaturaEm);
  const explicitLastRenewal = toValidDate(rawData.lastRenewalAt || rawData.ultimaRenovacaoEm);
  const expDate = toValidDate(rawData.dataExpiracao || rawData.expirationDate);
  const accessType = String(rawData.tipoAcesso || rawData.accessType || "mensal").toLowerCase();
  const isShortTrial = isShortTrialPlan(accessType);
  const isVitalicio = accessType === "vitalicio" || (expDate ? expDate.getFullYear() >= 2099 : false);

  const hasAsaasProof = Boolean(
    rawData.asaasPaymentId || rawData.asaasPaymentDate || rawData.subscriptionId
  );

  // Determina a origem do último pagamento no documento se não houver evento explícito
  let inferredDocOrigin: PaymentOrigin | null = null;
  if (rawData.lastPaymentOrigin === "app" || rawData.lastPaymentOrigin === "manual_admin") {
    inferredDocOrigin = rawData.lastPaymentOrigin;
  } else if (hasAsaasProof) {
    if (
      asaasPaymentDate &&
      paymentDate &&
      paymentDate.getTime() > asaasPaymentDate.getTime() + 24 * 60 * 60 * 1000
    ) {
      // Houve uma renovação manual mais recente que o último pagamento Asaas
      inferredDocOrigin = "manual_admin";
    } else {
      inferredDocOrigin = "app";
    }
  } else if (
    paymentDate ||
    rawData.criadoPorAdmin === true ||
    rawData.assinatura === "ATIVA" ||
    rawData.subscription === "ACTIVE" ||
    expDate
  ) {
    inferredDocOrigin = "manual_admin";
  }

  // Consolida lista de eventos (mesclando eventos persistidos + eventos inferidos de contas legadas)
  const events: SubscriptionHistoryEntry[] = [...storedEvents];

  // Determina data de entrada no app (joinedAt)
  const candidateJoinDates: Date[] = [];
  if (createdDate) candidateJoinDates.push(createdDate);
  if (explicitFirstSub) candidateJoinDates.push(explicitFirstSub);
  if (paymentDate) candidateJoinDates.push(paymentDate);
  if (asaasPaymentDate) candidateJoinDates.push(asaasPaymentDate);
  for (const ev of events) {
    const d = toValidDate(ev.date);
    if (d) candidateJoinDates.push(d);
  }
  // Se só tiver dataExpiracao (conta legada sem criadoEm), estima 1 mês antes do vencimento
  if (candidateJoinDates.length === 0 && expDate && expDate.getFullYear() < 2099) {
    const est = new Date(expDate);
    est.setMonth(est.getMonth() - 1);
    candidateJoinDates.push(est);
  }

  candidateJoinDates.sort((a, b) => a.getTime() - b.getTime());
  const joinedDate = candidateJoinDates[0] || null;

  // Garante evento de entrada ("joined") se tivermos data de entrada
  if (joinedDate && !events.some((e) => e.type === "joined")) {
    events.push({
      id: "inferred_joined",
      type: "joined",
      origin: rawData.criadoPorAdmin ? "manual_admin" : "app",
      paymentMethod: rawData.criadoPorAdmin ? "Cadastro Manual (Admin)" : "Cadastro no App",
      date: joinedDate.toISOString(),
      monthKey: toMonthKey(joinedDate),
      note: rawData.criadoPorAdmin
        ? "Conta criada manualmente pelo administrador"
        : "Cliente criou conta no aplicativo",
    });
  }

  // Verifica se o cliente já teve alguma assinatura real (não apenas cadastro inativo ou teste curto)
  const hasPaidOrActiveHistory =
    !isShortTrial &&
    Boolean(
      explicitFirstSub ||
        paymentDate ||
        asaasPaymentDate ||
        hasAsaasProof ||
        isVitalicio ||
        rawData.assinatura === "ATIVA" ||
        rawData.subscription === "ACTIVE" ||
        rawData.assinatura === "EXPIRADA" ||
        (expDate && expDate.getFullYear() < 2099) ||
        events.some(
          (e) =>
            e.type === "first_subscription" ||
            e.type === "renewal" ||
            e.type === "reactivation"
        )
    );

  const feeStr =
    typeof rawData.monthlyFee === "string"
      ? rawData.monthlyFee
      : typeof rawData.valor === "string"
        ? rawData.valor
        : typeof rawData.valorMensalidade === "number"
          ? rawData.valorMensalidade.toFixed(2).replace(".", ",")
          : undefined;

  // Se o cliente tem histórico de assinatura mas ainda não possui eventos de assinatura/renovação gravados
  const hasStoredSubEvent = events.some(
    (e) =>
      e.type === "first_subscription" ||
      e.type === "renewal" ||
      e.type === "reactivation"
  );

  if (hasPaidOrActiveHistory && !hasStoredSubEvent) {
    // Descobre a data da 1ª assinatura
    const firstSubCandidates: Date[] = [];
    if (explicitFirstSub) firstSubCandidates.push(explicitFirstSub);
    if (rawData.criadoPorAdmin && createdDate) firstSubCandidates.push(createdDate);
    if (asaasPaymentDate) firstSubCandidates.push(asaasPaymentDate);
    if (paymentDate) firstSubCandidates.push(paymentDate);
    if (firstSubCandidates.length === 0 && expDate && expDate.getFullYear() < 2099) {
      const est = new Date(expDate);
      est.setMonth(est.getMonth() - 1);
      firstSubCandidates.push(est);
    }
    if (firstSubCandidates.length === 0 && joinedDate) {
      firstSubCandidates.push(joinedDate);
    }
    firstSubCandidates.sort((a, b) => a.getTime() - b.getTime());
    const firstSubDate = firstSubCandidates[0];

    if (firstSubDate) {
      const firstOrigin: PaymentOrigin =
        hasAsaasProof && (!rawData.criadoPorAdmin || (asaasPaymentDate && Math.abs(asaasPaymentDate.getTime() - firstSubDate.getTime()) < 48 * 3600 * 1000))
          ? "app"
          : inferredDocOrigin || "manual_admin";

      events.push({
        id: "inferred_first_sub",
        type: "first_subscription",
        origin: firstOrigin,
        paymentMethod:
          firstOrigin === "app" ? "Pagamento pelo App (Asaas)" : "Ativação Manual (Admin)",
        date: firstSubDate.toISOString(),
        monthKey: toMonthKey(firstSubDate),
        plan: accessType,
        amount: feeStr,
        note:
          firstOrigin === "app"
            ? "1ª assinatura confirmada via pagamento no App"
            : "1ª assinatura liberada manualmente pelo Admin",
      });

      // Se existir uma data de pagamento/renovação em mês posterior à 1ª assinatura, adiciona evento de renovação
      const latestPayCandidates: Date[] = [];
      if (explicitLastRenewal) latestPayCandidates.push(explicitLastRenewal);
      if (paymentDate) latestPayCandidates.push(paymentDate);
      if (asaasPaymentDate) latestPayCandidates.push(asaasPaymentDate);
      if (expDate && expDate.getFullYear() < 2099) {
        const estPayFromExp = new Date(expDate);
        estPayFromExp.setMonth(estPayFromExp.getMonth() - 1);
        if (estPayFromExp.getTime() <= nowMs + 7 * 24 * 3600 * 1000) {
          latestPayCandidates.push(estPayFromExp);
        }
      }
      latestPayCandidates.sort((a, b) => b.getTime() - a.getTime());
      const latestPayDate = latestPayCandidates[0];

      if (
        latestPayDate &&
        toMonthKey(latestPayDate) > toMonthKey(firstSubDate)
      ) {
        const latestOrigin: PaymentOrigin = inferredDocOrigin || "manual_admin";
        events.push({
          id: "inferred_latest_renewal",
          type: "renewal",
          origin: latestOrigin,
          paymentMethod:
            latestOrigin === "app"
              ? "Renovação pelo App (Asaas)"
              : "Renovação Manual (Admin)",
          date: latestPayDate.toISOString(),
          monthKey: toMonthKey(latestPayDate),
          expirationDate: expDate ? expDate.toISOString() : undefined,
          plan: accessType,
          amount: feeStr,
          note:
            latestOrigin === "app"
              ? "Renovação automática/PIX pelo App"
              : "Renovação realizada manualmente pelo Admin",
        });
      }
    }
  } else if (isShortTrial && !events.some((e) => e.type === "trial") && joinedDate) {
    events.push({
      id: "inferred_trial",
      type: "trial",
      origin: rawData.criadoPorAdmin ? "manual_admin" : "app",
      paymentMethod: rawData.criadoPorAdmin ? "Teste liberado pelo Admin" : "Teste no App",
      date: (paymentDate || joinedDate).toISOString(),
      monthKey: toMonthKey(paymentDate || joinedDate),
      expirationDate: expDate ? expDate.toISOString() : undefined,
      plan: accessType,
      note: `Acesso de teste (${accessType})`,
    });
  }

  // Se a assinatura está vencida atualmente e não há evento "not_renewed" no mês do vencimento, adiciona
  const isCurrentlyExpired =
    !isVitalicio &&
    expDate !== null &&
    expDate.getFullYear() < 2099 &&
    expDate.getTime() <= nowMs;

  if (isCurrentlyExpired && expDate && hasPaidOrActiveHistory) {
    const expMonthKey = toMonthKey(expDate);
    const hasRenewalInOrAfterExpMonth = events.some(
      (e) =>
        (e.type === "renewal" || e.type === "reactivation" || e.type === "first_subscription") &&
        new Date(e.date).getTime() >= expDate.getTime()
    );
    const hasNotRenewedInExpMonth = events.some(
      (e) => (e.type === "not_renewed" || e.type === "revoked") && e.monthKey === expMonthKey
    );
    if (!hasRenewalInOrAfterExpMonth && !hasNotRenewedInExpMonth) {
      events.push({
        id: `inferred_expired_${expMonthKey}`,
        type: "not_renewed",
        origin: "system",
        paymentMethod: "Vencimento sem renovação",
        date: expDate.toISOString(),
        monthKey: expMonthKey,
        expirationDate: expDate.toISOString(),
        note: `Assinatura venceu em ${formatDatePtBr(expDate.toISOString())} e não foi renovada`,
      });
    }
  }

  // Ordena eventos cronologicamente (mais antigos primeiro para construir a linha do tempo mensal)
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // 3. Constrói a linha do tempo Mês a Mês desde o mês de entrada até o mês atual
  const startMonthKey = joinedDate ? toMonthKey(joinedDate) : currentMonthKey;
  const allMonthKeys = enumerateMonthKeys(startMonthKey, currentMonthKey);

  const subEvents = events.filter(
    (e) =>
      e.type === "first_subscription" ||
      e.type === "renewal" ||
      e.type === "reactivation"
  );
  const firstSubEvent = subEvents[0] || null;
  const firstSubMonthKey = firstSubEvent ? firstSubEvent.monthKey : null;

  // Meses cobertos por vigência ativa (ex.: pagou dia 20/Out -> cobre Out e Nov até 20/Nov)
  const coveredMonths = new Set<string>();
  for (const ev of subEvents) {
    coveredMonths.add(ev.monthKey);
    if (ev.expirationDate) {
      const expD = toValidDate(ev.expirationDate);
      if (expD && expD.getFullYear() < 2099) {
        // Se a data de expiração cai no mês seguinte mas ainda não venceu (ou cobriu parte significativa),
        // só marca o mês seguinte como "active_coverage" se ainda estiver vigente hoje (expD > now)
        if (expD.getTime() > nowMs) {
          for (const mk of enumerateMonthKeys(ev.monthKey, toMonthKey(expD))) {
            coveredMonths.add(mk);
          }
        }
      }
    }
  }
  if (isVitalicio && firstSubMonthKey) {
    for (const mk of enumerateMonthKeys(firstSubMonthKey, currentMonthKey)) {
      coveredMonths.add(mk);
    }
  } else if (expDate && expDate.getTime() > nowMs && expDate.getFullYear() < 2099) {
    // Se a assinatura atual está ativa e vence no futuro, o mês atual está coberto
    coveredMonths.add(currentMonthKey);
  }

  const monthlyTimeline: MonthTimelineItem[] = [];
  const monthsWithoutRenewal: string[] = [];
  const monthsWithoutRenewalKeys: string[] = [];
  let hadGapSinceLastSub = false;
  let lastReactivatedEvent: SubscriptionHistoryEntry | null = null;

  for (const mKey of allMonthKeys) {
    const monthEvents = events.filter((e) => e.monthKey === mKey);
    const monthSubEvents = monthEvents.filter(
      (e) =>
        e.type === "first_subscription" ||
        e.type === "renewal" ||
        e.type === "reactivation"
    );
    const explicitNotRenewed = monthEvents.find(
      (e) => e.type === "not_renewed" || e.type === "revoked"
    );

    const shortLabel = formatMonthKeyShort(mKey);
    const fullLabel = formatMonthKeyFull(mKey);

    if (firstSubMonthKey && mKey < firstSubMonthKey) {
      monthlyTimeline.push({
        monthKey: mKey,
        monthLabel: shortLabel,
        fullMonthLabel: fullLabel,
        status: "trial_or_free",
        statusLabel: "Cadastro / Teste",
        eventDate: monthEvents[0]?.date,
      });
      continue;
    }

    if (!firstSubMonthKey) {
      monthlyTimeline.push({
        monthKey: mKey,
        monthLabel: shortLabel,
        fullMonthLabel: fullLabel,
        status: "trial_or_free",
        statusLabel: isShortTrial ? "Em Teste" : "Sem Assinatura",
        eventDate: monthEvents[0]?.date,
      });
      continue;
    }

    if (monthSubEvents.length > 0) {
      const latestInMonth = monthSubEvents[monthSubEvents.length - 1];
      const isFirstMonth = mKey === firstSubMonthKey && latestInMonth.id === firstSubEvent?.id;
      const isReactivation =
        !isFirstMonth && (hadGapSinceLastSub || latestInMonth.type === "reactivation");

      if (isReactivation) {
        latestInMonth.type = "reactivation";
        lastReactivatedEvent = latestInMonth;
      }

      hadGapSinceLastSub = false;

      const status: MonthStatusType = isFirstMonth
        ? "first_subscription"
        : isReactivation
          ? "reactivated"
          : "renewed";

      const statusLabel = isFirstMonth
        ? "Assinou"
        : isReactivation
          ? "Renovou Novamente"
          : "Renovou";

      monthlyTimeline.push({
        monthKey: mKey,
        monthLabel: shortLabel,
        fullMonthLabel: fullLabel,
        status,
        statusLabel,
        origin: latestInMonth.origin,
        originLabel: formatOriginLabel(latestInMonth.origin),
        eventDate: latestInMonth.date,
        amount: latestInMonth.amount || feeStr,
      });
      continue;
    }

    // Não houve pagamento registrado neste mês: verifica se havia cobertura ativa ou se não renovou
    if (explicitNotRenewed && !coveredMonths.has(mKey)) {
      hadGapSinceLastSub = true;
      monthsWithoutRenewal.push(shortLabel);
      monthsWithoutRenewalKeys.push(mKey);
      monthlyTimeline.push({
        monthKey: mKey,
        monthLabel: shortLabel,
        fullMonthLabel: fullLabel,
        status: "not_renewed",
        statusLabel: "Não Renovou",
        eventDate: explicitNotRenewed.date,
      });
      continue;
    }

    if (coveredMonths.has(mKey)) {
      monthlyTimeline.push({
        monthKey: mKey,
        monthLabel: shortLabel,
        fullMonthLabel: fullLabel,
        status: "active_coverage",
        statusLabel: isVitalicio ? "Vitalício Ativo" : "Ativo (Em Vigência)",
        origin: inferredDocOrigin || firstSubEvent?.origin,
        originLabel: formatOriginLabel(inferredDocOrigin || firstSubEvent?.origin),
      });
      continue;
    }

    // Mês sem pagamento e sem cobertura ativa após a 1ª assinatura -> Não Renovou!
    hadGapSinceLastSub = true;
    monthsWithoutRenewal.push(shortLabel);
    monthsWithoutRenewalKeys.push(mKey);
    monthlyTimeline.push({
      monthKey: mKey,
      monthLabel: shortLabel,
      fullMonthLabel: fullLabel,
      status: "not_renewed",
      statusLabel: "Não Renovou",
      eventDate: explicitNotRenewed?.date,
    });
  }

  const latestSubEvent = subEvents.length > 0 ? subEvents[subEvents.length - 1] : null;
  const finalOrigin: PaymentOrigin | null =
    latestSubEvent?.origin || inferredDocOrigin || null;

  const totalAppRenewals = subEvents.filter((e) => e.origin === "app").length;
  const totalManualRenewals = subEvents.filter((e) => e.origin === "manual_admin").length;

  // Ordena eventos do mais recente para o mais antigo para exibição na lista
  const eventsDesc = [...events].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return {
    joinedAt: joinedDate ? joinedDate.toISOString() : null,
    joinedDateLabel: joinedDate ? formatDatePtBr(joinedDate.toISOString()) : "Não registrado",
    joinedMonthLabel: joinedDate ? formatMonthKeyFull(toMonthKey(joinedDate)) : "Não registrado",
    tenureLabel: computeTenureLabel(joinedDate, nowDate),
    firstSubscribedAt: firstSubEvent ? firstSubEvent.date : null,
    firstSubscribedLabel: firstSubEvent
      ? formatDatePtBr(firstSubEvent.date)
      : isShortTrial
        ? "Apenas Teste"
        : "Ainda não assinou",
    firstSubscribedOrigin: firstSubEvent ? firstSubEvent.origin : null,
    lastRenewalAt: latestSubEvent ? latestSubEvent.date : null,
    lastRenewalLabel: latestSubEvent ? formatDatePtBr(latestSubEvent.date) : "Sem renovações",
    lastRenewedAgainAt: lastReactivatedEvent ? lastReactivatedEvent.date : null,
    lastRenewedAgainLabel: lastReactivatedEvent
      ? formatDatePtBr(lastReactivatedEvent.date)
      : null,
    lastPaymentOrigin: finalOrigin,
    lastPaymentOriginLabel: formatOriginLabel(finalOrigin),
    lastPaymentMethodLabel:
      latestSubEvent?.paymentMethod ||
      (finalOrigin === "app"
        ? "Pagamento pelo App (Asaas)"
        : finalOrigin === "manual_admin"
          ? "Renovação Manual (Admin)"
          : "Sem pagamento registrado"),
    monthsWithoutRenewal,
    monthsWithoutRenewalKeys,
    monthlyTimeline,
    events: eventsDesc,
    totalAppRenewals,
    totalManualRenewals,
  };
}
