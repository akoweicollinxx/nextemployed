// IMPORTANT: has() checks use the plan SLUG, not the plan ID.
// - Plan slug: "pro_plan" (set in Clerk dashboard when creating the plan)
// - Plan ID: "cplan_xxxxxxxx" (auto-generated, used for __internal_openCheckout and API calls)
// The JWT's pla claim contains "u:{slug}", and has() strips the "u:" prefix.
// Verified via decoded JWT: pla claim = "u:pro_plan"
// Clerk's has() helper accepts the slug directly — no "u:" prefix needed.
export const PRO_PLAN_SLUG = 'pro_plan';
