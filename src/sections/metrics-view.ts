/** The common shape of subscription metrics and API reference rows. */
export interface MetricViewRow {
  m: {
    vendor: string; plan: string; model: string; cur: string; ver?: string; tps?: string;
    note?: string; source?: string; isEst?: boolean; windowPeriod?: string;
    apiIn?: number; apiOut?: number; apiCache?: number;
    [key: string]: unknown;
  };
  c: {
    priceCNY: number | null; costPerM: number | null;
    fLow: number | null; fHigh?: number | null;
    wkLowM: number | null; wkHighM?: number | null;
    moLow: number | null; moHigh?: number | null;
    val5h: number | null; valWk: number | null; valMo: number | null;
    r5h: number | null; rwk: number | null; rmo: number | null;
  };
  payg: boolean;
}
