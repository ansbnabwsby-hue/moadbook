import { createRemoteJWKSet, jwtVerify } from "jose";

const FIREBASE_PROJECT = "moadbook";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT}`;
const FIREBASE_AUDIENCE = FIREBASE_PROJECT;
const JWKS = createRemoteJWKSet(new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
));
const ADMIN_EMAIL = "moad33@accounts.example.com";
const ALLOWED_GAMES = new Set(["runner", "memory", "quiz", "block-puzzle", "snake"]);
const SETTINGS = new Set(["completion_points", "perfect_quiz_points", "daily_challenge_default_points"]);
const MAX_BODY_BYTES = 32 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin ?? "https://ansbnabwsby-hue.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
type Claims = { uid: string; email?: string; name?: string };
type RpcArgs = Record<string, unknown>;

class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}
function fail(message: string, code = "INVALID_INPUT"): never {
  throw new ApiError(code, message);
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function str(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== "string") fail(`${name} must be a string`);
  const result = value.trim();
  if (result.length < min || result.length > max) fail(`${name} has invalid length`);
  return result;
}
function integer(value: unknown, name: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail(`${name} is out of range`);
  return value as number;
}
function bool(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(`${name} must be boolean`);
  return value;
}
function uuid(value: unknown, name: string): string {
  const result = str(value, name, 36, 36);
  if (!UUID.test(result)) fail(`${name} must be a UUID`);
  return result;
}
function game(value: unknown): string {
  const result = str(value, "game_id", 1, 32);
  if (!ALLOWED_GAMES.has(result)) fail("Unknown game_id");
  return result;
}
function jsonObject(value: unknown, name: string, maxBytes = 8192): Record<string, unknown> {
  const result = object(value, name);
  if (encoder.encode(JSON.stringify(result)).length > maxBytes) fail(`${name} is too large`);
  return result;
}
function optionsValue(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  const input = jsonObject(value, "options", 4096);
  const allowed = new Set(["category", "difficulty", "count"]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail(`Unsupported options field: ${key}`);
  const result: Record<string, unknown> = {};
  if (input.category !== undefined) result.category = str(input.category, "options.category", 1, 80);
  if (input.difficulty !== undefined) {
    const difficulty = str(input.difficulty, "options.difficulty", 1, 24);
    if (!["سهل", "متوسط", "صعب", "الكل", "easy", "medium", "hard"].includes(difficulty)) fail("Invalid difficulty");
    result.difficulty = difficulty;
  }
  if (input.count !== undefined) result.count = integer(input.count, "options.count", 1, 10);
  return result;
}
function metricsValue(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  return jsonObject(value, "metrics", 8192);
}
function sourceFields(question: Record<string, unknown>, categoryId: string, explanation: string) {
  const rawUrl = typeof question.source_url === "string" ? question.source_url.trim() : "";
  if (!rawUrl && categoryId === "math") {
    const evidence = typeof question.evidence === "string" ? question.evidence.trim() : "";
    return {
      source_url: null,
      source_title: "تحقق حسابي مباشر",
      evidence: evidence ? str(evidence, "evidence", 1, 4000) : str(explanation, "evidence", 1, 4000),
    };
  }
  const url = str(rawUrl, "source_url", 1, 2048);
  let parsed: URL;
  try { parsed = new URL(url); } catch { fail("source_url must be a valid HTTPS URL"); }
  if (parsed.protocol !== "https:") fail("source_url must use HTTPS");
  return {
    source_url: url,
    source_title: str(question.source_title, "source_title", 1, 240),
    evidence: str(question.evidence, "evidence", 1, 4000),
  };
}
function questionValue(value: unknown): Record<string, unknown> {
  const q = object(value, "question");
  // Build a clean object: unknown request properties are never forwarded to Postgres.
  const id = q.id === undefined || q.id === null ? null : str(q.id, "question.id", 1, 80);
  if (id !== null && !/^[A-Za-z0-9_-]+$/.test(id)) fail("Invalid question.id");
  const categoryId = str(q.category_id, "question.category_id", 1, 40);
  const explanation = q.explanation === undefined || q.explanation === null ? "" : str(q.explanation, "question.explanation", 0, 1200);
  const source = sourceFields(q, categoryId, explanation);
  const result: Record<string, unknown> = {
    id,
    game_id: game(q.game_id),
    category_id: categoryId,
    category: str(q.category, "question.category", 1, 80),
    prompt: str(q.prompt, "question.prompt", 1, 1200),
    choices: Array.isArray(q.choices) && q.choices.length === 4
      ? q.choices.map((v, i) => str(v, `question.choices[${i}]`, 1, 300))
      : fail("question.choices must contain exactly four options"),
    answer_index: integer(q.answer_index, "question.answer_index", 0, 3),
    explanation,
    difficulty: q.difficulty === undefined ? "medium" : enumString(q.difficulty, "question.difficulty", ["easy", "medium", "hard"]),
    enabled: q.enabled === undefined ? true : bool(q.enabled, "question.enabled"),
    source_url: source.source_url,
    source_title: source.source_title,
    evidence: source.evidence,
  };
  return result;
}
function profile(claims: Claims) {
  const username = (typeof claims.email === "string" ? claims.email.split("@", 1)[0] : claims.uid).slice(0, 40);
  const displayName = String(claims.name ?? username ?? "لاعب").trim().slice(0, 80) || "لاعب";
  return { p_user_id: claims.uid, p_display_name: displayName, p_username: username || claims.uid.slice(0, 40) };
}
function mapAction(action: unknown, body: Record<string, unknown>, claims?: Claims): { rpc: string; args: RpcArgs } {
  if (typeof action !== "string") fail("action is required");
  if (action === "catalog") return { rpc: "moadbook_games_catalog", args: {} };
  if (!claims) throw new ApiError("UNAUTHORIZED", "Authentication required", 401);
  const p = profile(claims);
  const sid = () => uuid(body.session_id, "session_id");
  const stoken = () => uuid(body.session_token, "session_token");
  const questionId = () => { const value = str(body.question_id, "question_id", 1, 80); if (!/^[A-Za-z0-9_-]+$/.test(value)) fail("Invalid question_id"); return value; };
  switch (action) {
    case "start_session": return { rpc: "moadbook_games_start_session", args: { ...p, p_game_id: game(body.game_id), p_options: optionsValue(body.options) } };
    case "cancel_session": return { rpc: "moadbook_games_cancel_session", args: { p_user_id: claims.uid, p_session_id: sid(), p_session_token: stoken() } };
    case "answer_question": return { rpc: "moadbook_games_answer_question", args: { p_user_id: claims.uid, p_session_id: sid(), p_session_token: stoken(), p_question_id: questionId(), p_choice_index: integer(body.choice_index, "choice_index", -1, 3), p_elapsed_ms: integer(body.elapsed_ms, "elapsed_ms", 0, 3_600_000) } };
    case "finish_session": return { rpc: "moadbook_games_finish_session", args: { p_user_id: claims.uid, p_session_id: sid(), p_session_token: stoken(), p_client_score: integer(body.client_score, "client_score", 0, 1_000_000), p_duration_ms: integer(body.duration_ms, "duration_ms", 0, 86_400_000), p_metrics: metricsValue(body.metrics) } };
    case "dashboard": return { rpc: "moadbook_games_dashboard", args: p };
    case "leaderboard": return { rpc: "moadbook_games_leaderboard", args: { p_user_id: claims.uid, p_game_id: body.game_id == null ? null : game(body.game_id), p_period: enumString(body.period ?? "all-time", "period", ["all-time", "weekly", "monthly"]), p_limit: integer(body.limit ?? 25, "limit", 1, 100) } };
    case "admin_overview": return { rpc: "moadbook_games_admin_overview", args: admin(claims, { p_admin_user_id: claims.uid }) };
    case "admin_save_game": return { rpc: "moadbook_games_admin_save_game", args: admin(claims, { p_admin_user_id: claims.uid, p_game_id: game(body.game_id), p_patch: gamePatch(body.patch) }) };
    case "admin_save_achievement": return { rpc: "moadbook_games_admin_save_achievement", args: admin(claims, { p_admin_user_id: claims.uid, p_id: str(body.id, "id", 1, 80), p_points: integer(body.points, "points", 0, 500), p_enabled: bool(body.enabled, "enabled") }) };
    case "admin_review_score": return { rpc: "moadbook_games_admin_review_score", args: admin(claims, { p_admin_user_id: claims.uid, p_score_id: uuid(body.score_id, "score_id"), p_decision: enumString(body.decision, "decision", ["approve", "reject"]) }) };
    case "admin_save_question": return { rpc: "moadbook_games_admin_save_question", args: admin(claims, { p_admin_user_id: claims.uid, p_question: questionValue(body.question) }) };
    case "admin_toggle_question": return { rpc: "moadbook_games_admin_toggle_question", args: admin(claims, { p_admin_user_id: claims.uid, p_question_id: (() => { const value = str(body.question_id, "question_id", 1, 80); if (!/^[A-Za-z0-9_-]+$/.test(value)) fail("Invalid question_id"); return value; })(), p_enabled: bool(body.enabled, "enabled") }) };
    case "admin_save_challenge": return { rpc: "moadbook_games_admin_save_challenge", args: admin(claims, { p_admin_user_id: claims.uid, p_game_id: game(body.game_id), p_metric: enumString(body.metric, "metric", ["min_score", "levels_completed", "correct_answers", "lines_cleared", "foods_eaten", "obstacles_dodged", "moves", "rounds_completed"]), p_target: integer(body.target, "target", 1, 1_000_000), p_reward_points: integer(body.reward_points, "reward_points", 0, 500), p_title: str(body.title, "title", 1, 160) }) };
    case "admin_save_setting": {
      const key = str(body.key, "key", 1, 80);
      if (!SETTINGS.has(key)) fail("Unknown setting key");
      return { rpc: "moadbook_games_admin_save_setting", args: admin(claims, { p_admin_user_id: claims.uid, p_key: key, p_value: settingValue(key, body.value) }) };
    }
    default: throw new ApiError("UNKNOWN_ACTION", "Unknown action", 400);
  }
}
function admin<T extends RpcArgs>(claims: Claims, args: T): T {
  if (claims.email?.toLowerCase() !== ADMIN_EMAIL) throw new ApiError("FORBIDDEN", "Administrator access required", 403);
  return args;
}
function enumString<T extends string>(value: unknown, name: string, choices: readonly T[]): T {
  const result = str(value, name, 1, 24);
  if (!choices.includes(result as T)) fail(`Invalid ${name}`);
  return result as T;
}
function gamePatch(value: unknown): Record<string, unknown> {
  const patch = object(value, "patch");
  const allowed: Record<string, (v: unknown) => unknown> = {
    title: (v) => str(v, "patch.title", 1, 120), description: (v) => str(v, "patch.description", 0, 1000),
    enabled: (v) => bool(v, "patch.enabled"), featured: (v) => bool(v, "patch.featured"), sort_order: (v) => integer(v, "patch.sort_order", 0, 10000),
    icon: (v) => str(v, "patch.icon", 1, 32), version: (v) => str(v, "patch.version", 1, 40),
    accent: (v) => enumString(v, "patch.accent", ["mint", "gold", "blue", "green", "violet"]),
    image_url: (v) => {
      const url = str(v, "patch.image_url", 0, 2048);
      if (!url) return "";
      let parsed: URL;
      try { parsed = new URL(url); } catch { fail("patch.image_url must be a valid HTTPS URL"); }
      if (parsed.protocol !== "https:") fail("patch.image_url must use HTTPS");
      return url;
    },
  };
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(patch)) {
    if (!allowed[key]) fail(`Unsupported patch field: ${key}`);
    clean[key] = allowed[key](val);
  }
  if (Object.keys(clean).length === 0) fail("patch must not be empty");
  return clean;
}
function settingValue(key: string, value: unknown): unknown {
  if (key === "completion_points") return integer(value, "value", 0, 50);
  if (key === "perfect_quiz_points") return integer(value, "value", 0, 200);
  if (key === "daily_challenge_default_points") return integer(value, "value", 0, 500);
  fail("Invalid setting value");
}
function response(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const isAllowed = !origin || origin === "https://ansbnabwsby-hue.github.io" || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const cors = corsHeaders(isAllowed ? origin : null);
  if (!isAllowed) return response({ error: "Origin not allowed", code: "FORBIDDEN" }, 403, cors);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return response({ error: "Method not allowed", code: "METHOD_NOT_ALLOWED" }, 405, cors);
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large", 413);
    const raw = await request.text();
    if (encoder.encode(raw).length > MAX_BODY_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "Request body is too large", 413);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new ApiError("INVALID_JSON", "Request body must be valid JSON", 400); }
    const body = object(parsed, "body");
    let claims: Claims | undefined;
    if (body.action !== "catalog") {
      const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
      if (!match) throw new ApiError("UNAUTHORIZED", "Authentication required", 401);
      try {
        const { payload } = await jwtVerify(match[1], JWKS, { issuer: FIREBASE_ISSUER, audience: FIREBASE_AUDIENCE, algorithms: ["RS256"] });
        if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) throw new Error("invalid subject");
        claims = { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined, name: typeof payload.name === "string" ? payload.name : undefined };
      } catch {
        throw new ApiError("UNAUTHORIZED", "Invalid or expired authentication token", 401);
      }
    }
    const { rpc, args } = mapAction(body.action, body, claims);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new ApiError("SERVER_CONFIG", "Service unavailable", 500);
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/${rpc}`;
    let upstream: Response;
    try {
      upstream = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Accept-Profile": "public", "Content-Profile": "public" }, body: JSON.stringify(args) });
    } catch {
      throw new ApiError("UPSTREAM_ERROR", "Request could not be completed", 502);
    }
    if (!upstream.ok) throw new ApiError("RPC_ERROR", "Request could not be completed", 400);
    let data: unknown;
    try { data = await upstream.json(); } catch { throw new ApiError("RPC_ERROR", "Request could not be completed", 502); }
    return response({ data }, 200, cors);
  } catch (error) {
    if (error instanceof ApiError) return response({ error: error.message, code: error.code }, error.status, cors);
    return response({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500, cors);
  }
});
