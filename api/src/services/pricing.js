/*
 * Anthropic API pricing per million tokens (USD). Last updated 2026-05-12.
 * Keys match the model id returned in Anthropic responses; we also accept a few
 * convenience aliases (without date suffix) for forward-compat.
 *
 * cache_write is the 5-minute ephemeral cache rate (the only one we use today).
 * If we ever opt into 1h cache, add cache_write_1h: input * 2.
 */
const RATES = {
  // Opus 4.x
  "claude-opus-4-7": { input: 15, output: 75, cache_write: 18.75, cache_read: 1.5 },
  "claude-opus-4-6": { input: 15, output: 75, cache_write: 18.75, cache_read: 1.5 },
  "claude-opus-4-5": { input: 15, output: 75, cache_write: 18.75, cache_read: 1.5 },
  // Sonnet 4.x
  "claude-sonnet-4-6": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  "claude-sonnet-4-5": { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 },
  // Haiku 4.x / 3.5
  "claude-haiku-4-5": { input: 1, output: 5, cache_write: 1.25, cache_read: 0.1 },
  "claude-3-5-haiku-latest": { input: 0.8, output: 4, cache_write: 1, cache_read: 0.08 },
};

function normalizeModelId(model) {
  if (!model) return null;
  // Strip date suffixes ("-20251001"), bracketed context markers ("[1m]") and trailing dots
  return model
    .replace(/-\d{8}$/, "")
    .replace(/\[[^\]]*\]$/, "")
    .trim();
}

function getRates(model) {
  const id = normalizeModelId(model);
  return RATES[id] || null;
}

/**
 * Compute USD cost from an Anthropic usage object.
 * @param {string} model     model id from the response message
 * @param {object} usage     { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens }
 * @returns {{ usd: number, model: string, rates: object|null, tokens: object }}
 */
function computeCost(model, usage) {
  const u = usage || {};
  const tokens_in = u.input_tokens || 0;
  const tokens_out = u.output_tokens || 0;
  const tokens_cache_write = u.cache_creation_input_tokens || 0;
  const tokens_cache_read = u.cache_read_input_tokens || 0;
  const tokens = { tokens_in, tokens_out, tokens_cache_write, tokens_cache_read };

  const rates = getRates(model);
  if (!rates) {
    console.warn(`[pricing] no rates for model="${model}" — recording 0 cost`);
    return { usd: 0, model, rates: null, tokens };
  }
  const usd =
    (tokens_in * rates.input +
      tokens_out * rates.output +
      tokens_cache_write * rates.cache_write +
      tokens_cache_read * rates.cache_read) /
    1_000_000;
  return { usd, model, rates, tokens };
}

module.exports = { computeCost, getRates, normalizeModelId, RATES };
