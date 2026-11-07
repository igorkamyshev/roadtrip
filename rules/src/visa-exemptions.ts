// The visa exemptions' table, edited by hand (spec «Визовые правила и сведение»). Its schema is `VisaExemption` in
// index.ts; `pnpm test` checks it with visaExemptionsProblems.
import type { VisaExemption } from './index.ts';

export const VISA_EXEMPTIONS: readonly VisaExemption[] = [];
