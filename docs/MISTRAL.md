# Running AutoDoc with Mistral

AutoDoc can run its notes pipeline and Ask AI on the [Mistral API](https://docs.mistral.ai/) instead of the managed local Ollama runtime. Mistral mode is enabled entirely through environment variables — no UI changes are required.

## How it works

When Mistral mode is active, AutoDoc does not download or start a local Ollama runtime. Instead it starts a loopback adapter (`src/main/services/mistral-ollama-adapter.ts`) on the same port the app already uses for Ollama (`127.0.0.1:11435`, or `11436` in QA builds). The adapter implements the Ollama HTTP surface the app speaks today:

| Ollama endpoint | Mistral translation |
| --- | --- |
| `POST /api/generate` | `POST /v1/chat/completions` (streaming NDJSON and metrics preserved) |
| `POST /api/chat` | `POST /v1/chat/completions`, including tool calls for the Ask AI agent |
| `POST /api/embed` | `POST /v1/embeddings` (`mistral-embed`) |
| `GET /api/tags` | Static inventory of the expected AutoDoc model names |
| `POST /api/pull`, `/api/delete` | Instant success (nothing to download) |

Ollama request options map onto Mistral parameters as follows: `num_predict` → `max_tokens`, `seed` → `random_seed`, `stop` → `stop`, `temperature` → `temperature`. Ollama `format` constraints map to `response_format` (`json` → `json_object`, a JSON schema → `json_schema`). `num_ctx` has no Mistral equivalent and is ignored.

## Configuration

The recommended way to enable Mistral mode is the **in-app option**. It is available in two places:

- **Settings → Mistral API**: enter, change, or disconnect the API key at any time, and pick the chat model. As soon as a key is connected, the model list is fetched from the Mistral API and offered in the picker (any other Mistral model ID can still be typed in).
- **Onboarding**: the AI setup step offers **Use Mistral API** with an API key field.

In both places the key is validated against the Mistral API, stored in AutoDoc's preferences, and the app switches immediately — no environment variables needed.

Alternatively, set `MISTRAL_API_KEY` before launching the app. A key entered in the app takes precedence over the environment variable.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MISTRAL_API_KEY` | — | Enables Mistral mode when no key is stored in the app. |
| `AUTODOC_LLM_PROVIDER` | auto | Set to `ollama` to force the local runtime even when a key is present. |
| `AUTODOC_MISTRAL_MODEL` | `mistral-small-latest` | Chat model used for notes and Ask AI when no model is selected in Settings; a selection in Settings takes precedence. |
| `AUTODOC_MISTRAL_EMBEDDING_MODEL` | `mistral-embed` | Embedding model used for Ask AI search. |
| `MISTRAL_BASE_URL` | `https://api.mistral.ai` | Override for proxies or Mistral-compatible gateways. |

Example:

```bash
export MISTRAL_API_KEY=...
# optional
export AUTODOC_MISTRAL_MODEL=mistral-small-latest
npm run dev
```

## Verifying Mistral mode in the app

- The sidebar status shows **Mistral connected** (instead of Ollama connected) while notes and Ask AI run on Mistral.
- Settings shows the active Mistral chat model under the AI model entry.
- During onboarding, the AI setup step completes immediately with a Mistral confirmation instead of downloading local models.

## Notes

- Meeting audio still transcribes locally with Whisper; only the LLM (notes and Ask AI) and Ask AI embeddings move to Mistral.
- Ask AI embeddings have a different dimensionality than the local `qwen3-embedding` model. Meetings indexed before switching keep their existing index entries; if search quality degrades, clear and rebuild the Ask AI index in Settings.
- Transcripts are sent to the Mistral API for processing. If you need fully offline processing, keep the default local Ollama mode.
