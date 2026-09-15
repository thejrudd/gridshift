// Unwired-slot placeholders from the Claude Design drilldown study.
//
// The design renders blocks GridShift cannot source yet as explicitly labelled
// dashed slots rather than faking values. Those placeholders are a review aid,
// not production UI, so they are gated behind a dev-only flag: run the dev
// server with VITE_DRILLDOWN_SLOTS=true to review the full design against real
// data. Production builds always drop them (import.meta.env.DEV is false).
export const DRILLDOWN_DEV_SLOTS_ENABLED = Boolean(
  import.meta.env.DEV && import.meta.env.VITE_DRILLDOWN_SLOTS === 'true',
);
