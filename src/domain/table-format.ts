import { MAINTENANCE_SUMMARY, PRICE_CHECKS } from '../generated/catalog';
import { fmtTok } from './metrics';
import { cpmTier } from './core';

/* 引号 doubling 之外，还要防 CSV 公式注入：以 = + - @ 开头的单元格加 ' 前缀，Excel 不会当公式执行。所有 CSV 导出共用。 */
export function csvCell(v: unknown) {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s))
        s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
}

/* ---------- 动态 / 来源 / 说明 ---------- */
/* 来源证据只增不改：记录改用新来源后，旧证据留在台账里，但不再作为当前依据展示。 */
export function currentPriceSources() {
    const used = new Set(Object.values(PRICE_CHECKS.rows).flatMap((row) => row.sourceIds || []));
    return Object.entries(PRICE_CHECKS.sources).filter(([id]) => used.has(id)).map(([, source]) => source);
}

export function chinaCalendarDay(now: Date = new Date()) {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${value("year")}-${value("month")}-${value("day")}`;
}

/** 距核查日的天数，按北京时间的日历日比较；日期无效或晚于今天（时区差）时返回 null。 */
export function daysSince(date: string | null | undefined, today: string = chinaCalendarDay()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")))
        return null;
    const diff = Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(date + "T00:00:00Z")) / 86400000);
    return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

/* 复查间隔与维护摘要一致（首屏摘要提供，缺省 14 天）。 */
export function staleAfterDays() {
    return MAINTENANCE_SUMMARY.staleAfterDays > 0 ? MAINTENANCE_SUMMARY.staleAfterDays : 14;
}

/** 核查日期是否已超过复查间隔。 */
export function checkIsStale(date: string | null | undefined, today: string = chinaCalendarDay()) {
    const age = daysSince(date, today);
    return age != null && age >= staleAfterDays();
}

/** 「（6 天前）」「（今天）」；超过复查间隔时注明。 */
export function checkAgeText(date: string | null | undefined, today: string = chinaCalendarDay()) {
    const age = daysSince(date, today);
    if (age == null)
        return "";
    return `（${age === 0 ? "今天" : age + " 天前"}${age >= staleAfterDays() ? "，超过复查间隔" : ""}）`;
}

type DynamicDates = Pick<DynamicItem, "date" | "text" | "checked" | "endDate">;

export function dynamicEndDate(d: DynamicDates) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.endDate || ""))
        return d.endDate!;
    /* 旧记录只有文字范围；仅识别活动期限，核对日志保持其当日原文。 */
    if (d.checked || !/活动|促销|畅用/.test(d.text || ""))
        return "";
    const range = String(d.text || "").match(/(\d{2})-(\d{2})\s*[~～–—]\s*(\d{2})-(\d{2})/);
    if (!range || !/^\d{4}-/.test(d.date || ""))
        return "";
    const [, startMonth, startDay, endMonth, endDay] = range as unknown as [string, string, string, string, string];
    const year = Number(d.date.slice(0, 4)) + (endMonth + endDay < startMonth + startDay ? 1 : 0);
    return `${year}-${endMonth}-${endDay}`;
}

export function dynamicStatus(d: DynamicDates, today: string = chinaCalendarDay()) {
    if (!d.checked && /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") && d.date > today)
        return { key: "upcoming", label: "计划中 · 尚未发生" };
    const endDate = dynamicEndDate(d);
    if (endDate && endDate < today)
        return { key: "ended", label: "已结束 · " + endDate };
    return { key: "", label: "" };
}

/** 动态正文：尚未发生的退役写成「计划于 …」，其余照原文。 */
export function dynamicText(d: DynamicDates, today: string = chinaCalendarDay()) {
    return dynamicStatus(d, today).key === "upcoming" ? String(d.text).replace(/于 (\d{4}-\d{2}-\d{2}) 退役/, "计划于 $1 退役") : d.text;
}

/* 无额度（credits 制无牌价）的时段显示占位。与 windowSentence 的 tokSpan 同一规则：
   上下限差 ≤5% 时只显上限值，避免「100–103M」这类噪音区间。 */
export function fTokCell(lo: number | null | undefined, hi: number | null | undefined, emptyLabel: string = "credits制") {
    if (lo == null)
        return emptyLabel;
    const lowText = fmtTok(lo), highText = hi == null ? lowText : fmtTok(hi);
    return hi == null || !(hi > lo * 1.05) || lowText === highText ? lowText : `${lowText}–${highText}`;
}

export function fmtRate(v: number | null | undefined) { return v == null ? "—" : `${v.toFixed(1)}×`; }

export function fmtVal(v: number | null | undefined, cur: string) {
    if (v == null || !Number.isFinite(v))
        return "—";
    if (cur === "CNY")
        return "¥" + (v >= 10000 ? (v / 10000).toFixed(1) + "万" : Math.round(v).toLocaleString("zh-CN"));
    return "$" + (v >= 1000 ? (v / 1000).toFixed(1) + "K" : v.toFixed(1));
}

export function rateClass(r: number | null | undefined) { return r == null || !Number.isFinite(r) ? "" : r >= 5 ? "rate-hi" : r >= 1.5 ? "rate-mid" : "rate-lo"; }

export function fmtCpm(v: number | null | undefined) { return v == null ? "—" : "¥" + (v < 1 ? v.toFixed(3) : v < 10 ? v.toFixed(2) : v.toFixed(1)); }

export function fmtUnit(n: number) {
    if (n >= 10)
        return String(Math.round(n * 10) / 10);
    if (n >= 1)
        return String(Math.round(n * 100) / 100);
    return String(Math.round(n * 10000) / 10000);
}

export function listPriceHint(m: Pick<QuotaRow, "apiIn" | "apiOut" | "apiCache"> & { cur: string }) {
    if (typeof m.apiIn !== "number")
        return "";
    const sym = m.cur === "USD" ? "$" : "¥";
    return `输入 ${sym}${fmtUnit(m.apiIn)} / 输出 ${sym}${fmtUnit(m.apiOut)} / 缓存 ${sym}${fmtUnit(m.apiCache)}`;
}

export function cpmColor(v: number | null | undefined) {
    const tier = cpmTier(v);
    return tier === "na" ? "var(--faint)" : tier === "lo" ? "var(--green)" : tier === "mid" ? "var(--gold)" : "var(--red)";
}
