/**
 * Request-scoped AI configuration. Lets the AI service pick the tenant's own
 * LLM provider (or the OOB default) without threading config through every
 * ai-service function. An Express middleware seeds the store per request; the
 * ai-service reads it via getAiContext().
 */
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithAiContext(ctx, fn) {
  return storage.run(ctx || {}, fn);
}

function getAiContext() {
  return storage.getStore() || {};
}

module.exports = { runWithAiContext, getAiContext };
