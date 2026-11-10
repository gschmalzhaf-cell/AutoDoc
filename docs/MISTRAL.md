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

| Variable | Default | Purpose |
| --- | --- | --- |
| `MISTRAL_API_KEY` | — | Required. Mistral mode activates when this is set. |
| `AUTODOC_LLM_PROVIDER` | auto | Set to `ollama` to force the local runtime even when a key is present. |
| `AUTODOC_MISTRAL_MODEL` | `mistral-small-latest` | Chat model used for notes and Ask AI. |
| `AUTODOC_MISTRAL_EMBEDDING_MODEL` | `mistral-embed` | Embedding model used for Ask AI search. |
| `MISTRAL_BASE_URL` | `https://api.mistral.ai` | Override for proxies or Mistral-compatible gateways. |

Example:

```bash
export MISTRAL_API_KEY=...
# optional
export AUTODOC_MISTRAL_MODEL=mistral-small-latest
npm run dev
```

## Notes

- Meeting audio still transcribes locally with Whisper; only the LLM (notes and Ask AI) and Ask AI embeddings move to Mistral.
- Ask AI embeddings have a different dimensionality than the local `qwen3-embedding` model. Meetings indexed before switching keep their existing index entries; if search quality degrades, clear and rebuild the Ask AI index in Settings.
- Transcripts are sent to the Mistral API for processing. If you need fully offline processing, keep the default local Ollama mode.
