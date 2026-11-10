/**
 * Configuration for running AutoDoc's notes and Ask AI inference against the
 * Mistral API instead of the managed local Ollama runtime. When Mistral mode
 * is enabled, a loopback adapter (see mistral-ollama-adapter.ts) serves the
 * Ollama HTTP surface and translates every request to the Mistral API.
 */

export const MISTRAL_NOTES_MODEL_DEFAULT = 'mistral-small-latest'
export const MISTRAL_EMBEDDING_MODEL_DEFAULT = 'mistral-embed'
const MISTRAL_API_BASE_URL_DEFAULT = 'https://api.mistral.ai'

let storedKeyProvider: () => string = () => ''

/** Main-process wiring injects the persisted key from the preferences store. */
export function setMistralApiKeyProvider(provider: () => string): void {
  storedKeyProvider = provider
}

export function getMistralApiKey(): string {
  const stored = storedKeyProvider().trim()
  if (stored.length > 0) return stored
  return (process.env.MISTRAL_API_KEY ?? '').trim()
}

export function getMistralApiBaseUrl(): string {
  return (process.env.MISTRAL_BASE_URL ?? MISTRAL_API_BASE_URL_DEFAULT).trim().replace(/\/+$/, '')
}

let storedModelProvider: () => string | undefined = () => undefined

/** Main-process wiring injects the persisted model choice from the preferences store. */
export function setMistralModelProvider(provider: () => string | undefined): void {
  storedModelProvider = provider
}

export function getMistralNotesModel(): string {
  return storedModelProvider() ?? process.env.AUTODOC_MISTRAL_MODEL ?? MISTRAL_NOTES_MODEL_DEFAULT
}

export function getMistralEmbeddingModel(): string {
  return process.env.AUTODOC_MISTRAL_EMBEDDING_MODEL ?? MISTRAL_EMBEDDING_MODEL_DEFAULT
}

/**
 * Mistral mode is enabled when an API key is present and the provider override
 * does not explicitly pin the app to the local Ollama runtime.
 */
export function isMistralModeEnabled(): boolean {
  if (process.env.AUTODOC_LLM_PROVIDER === 'ollama') return false
  return getMistralApiKey().length > 0
}
