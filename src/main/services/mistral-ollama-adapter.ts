import { createServer, type Server } from 'http'
import {
  DEFAULT_OLLAMA_EMBEDDING_MODEL,
  DEFAULT_OLLAMA_MODEL,
  LEGACY_OLLAMA_MODEL,
  LOW_SPEC_MAC_OLLAMA_MODEL
} from '../../shared/constants'
import {
  getMistralApiBaseUrl,
  getMistralApiKey,
  getMistralEmbeddingModel,
  getMistralNotesModel
} from './mistral-config'
import { logAutodocEvent } from './autodoc-log'

/**
 * Loopback adapter that implements the Ollama HTTP surface AutoDoc already
 * speaks (notes writer, Ask AI, embeddings, health checks) and forwards every
 * request to the Mistral API. This lets the whole app run on Mistral without
 * touching the Ollama-specific request/response handling in llm.ts,
 * ask-ai-agent.ts, or chat-ipc.ts.
 */

export const MISTRAL_ADAPTER_PORT = __AUTODOC_QA_BUILD__ ? 11436 : 11435
export const MISTRAL_ADAPTER_HOST = '127.0.0.1'

interface MistralChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_calls?: Array<{
    id?: string
    type?: string
    function: { name: string; arguments: string }
  }>
}

interface MistralChatRequestBody {
  model: string
  messages: MistralChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  random_seed?: number
  stop?: string[]
  response_format?: {
    type: 'json_object' | 'json_schema'
    json_schema?: { name: string; schema: unknown }
  }
  tools?: unknown[]
}

export function ollamaFormatToMistralResponseFormat(
  format: unknown
): MistralChatRequestBody['response_format'] {
  if (format === 'json') return { type: 'json_object' }
  if (format != null && typeof format === 'object') {
    return {
      type: 'json_schema',
      json_schema: { name: 'autodoc_notes', schema: format }
    }
  }
  return undefined
}

export function ollamaOptionsToMistralParams(options: unknown): {
  temperature?: number
  max_tokens?: number
  random_seed?: number
  stop?: string[]
} {
  const raw = (options ?? {}) as Record<string, unknown>
  const params: {
    temperature?: number
    max_tokens?: number
    random_seed?: number
    stop?: string[]
  } = {}
  if (typeof raw.temperature === 'number' && Number.isFinite(raw.temperature)) {
    params.temperature = raw.temperature
  }
  if (typeof raw.num_predict === 'number' && raw.num_predict > 0) {
    params.max_tokens = Math.round(raw.num_predict)
  }
  if (typeof raw.seed === 'number' && Number.isFinite(raw.seed)) {
    params.random_seed = Math.round(raw.seed)
  }
  if (Array.isArray(raw.stop) && raw.stop.length > 0) {
    params.stop = raw.stop.filter((entry): entry is string => typeof entry === 'string')
  }
  return params
}

export function ollamaGenerateToMistralChat(body: {
  model?: string
  prompt?: string
  system?: string
  format?: unknown
  options?: unknown
}): MistralChatRequestBody {
  const messages: MistralChatMessage[] = []
  if (typeof body.system === 'string' && body.system.length > 0) {
    messages.push({ role: 'system', content: body.system })
  }
  messages.push({ role: 'user', content: body.prompt ?? '' })
  return {
    model: getMistralNotesModel(),
    messages,
    ...ollamaOptionsToMistralParams(body.options),
    response_format: ollamaFormatToMistralResponseFormat(body.format)
  }
}

export function ollamaChatToMistralChat(body: {
  model?: string
  messages?: Array<Record<string, unknown>>
  tools?: unknown[]
  format?: unknown
  options?: unknown
}): MistralChatRequestBody {
  const messages: MistralChatMessage[] = (body.messages ?? []).map((message) => {
    const role = (
      typeof message.role === 'string' ? message.role : 'user'
    ) as MistralChatMessage['role']
    if (role === 'tool') {
      return {
        role: 'tool',
        content: typeof message.content === 'string' ? message.content : '',
        name: typeof message.tool_name === 'string' ? message.tool_name : undefined
      }
    }
    const entry: MistralChatMessage = {
      role,
      content: typeof message.content === 'string' ? message.content : ''
    }
    if (Array.isArray(message.tool_calls)) {
      entry.tool_calls = (message.tool_calls as unknown[])
        .filter((call): call is Record<string, unknown> => call != null && typeof call === 'object')
        .map((call, index) => {
          const fn = (call.function ?? {}) as Record<string, unknown>
          return {
            id: typeof call.id === 'string' ? call.id : `call_${index}`,
            type: 'function',
            function: {
              name: typeof fn.name === 'string' ? fn.name : '',
              arguments:
                typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {})
            }
          }
        })
    }
    return entry
  })
  const request: MistralChatRequestBody = {
    model: getMistralNotesModel(),
    messages,
    ...ollamaOptionsToMistralParams(body.options)
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    request.tools = body.tools
  }
  const responseFormat = ollamaFormatToMistralResponseFormat(body.format)
  if (responseFormat) request.response_format = responseFormat
  return request
}

export interface OllamaAssistantMessage {
  role: string
  content: string
  tool_calls?: Array<{ function: { name: string; arguments: string } }>
}

export function mistralMessageToOllamaMessage(message: {
  role?: string
  content?: string | null
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>
}): OllamaAssistantMessage {
  const content = typeof message.content === 'string' ? message.content : ''
  const ollamaMessage: OllamaAssistantMessage = {
    role: message.role ?? 'assistant',
    content
  }
  if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
    ollamaMessage.tool_calls = message.tool_calls.map((call) => ({
      function: {
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '{}'
      }
    }))
  }
  return ollamaMessage
}

function ollamaMetricsFromUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
  elapsedMs: number
): Record<string, number> {
  const elapsedNs = Math.max(1, Math.round(elapsedMs * 1_000_000))
  return {
    total_duration: elapsedNs,
    load_duration: 0,
    prompt_eval_count: usage?.prompt_tokens ?? 0,
    prompt_eval_duration: Math.round(elapsedNs / 2),
    eval_count: usage?.completion_tokens ?? 0,
    eval_duration: Math.round(elapsedNs / 2)
  }
}

function adapterModelInventory(): {
  models: Array<{ name: string; model: string; size: number; digest: string; modified_at: string }>
} {
  const names = [
    DEFAULT_OLLAMA_MODEL,
    LEGACY_OLLAMA_MODEL,
    LOW_SPEC_MAC_OLLAMA_MODEL,
    DEFAULT_OLLAMA_EMBEDDING_MODEL
  ]
  return {
    models: names.map((name) => ({
      name,
      model: name,
      size: 0,
      digest: 'mistral',
      modified_at: new Date().toISOString()
    }))
  }
}

async function readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

interface MistralSseChunk {
  choices?: Array<{
    delta?: { content?: string | null }
    message?: { content?: string | null }
    finish_reason?: string | null
  }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

async function pipeMistralSseToOllamaNdjson(
  upstream: Response,
  writeLine: (line: unknown) => void,
  startedAt: number
): Promise<void> {
  if (!upstream.body) throw new Error('Mistral stream returned no body')
  const reader = upstream.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '' || payload === '[DONE]') continue
        let chunk: MistralSseChunk
        try {
          chunk = JSON.parse(payload) as MistralSseChunk
        } catch {
          continue
        }
        if (chunk.usage) usage = chunk.usage
        const delta = chunk.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          writeLine({
            response: delta,
            message: { role: 'assistant', content: delta },
            done: false
          })
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  writeLine({
    response: '',
    message: { role: 'assistant', content: '' },
    done: true,
    done_reason: 'stop',
    ...ollamaMetricsFromUsage(usage, Date.now() - startedAt)
  })
}

export interface MistralAdapterHandle {
  server: Server
  port: number
  close(): Promise<void>
}

export interface MistralAdapterOptions {
  port?: number
  host?: string
  apiKey?: string
  apiBaseUrl?: string
}

export function startMistralOllamaAdapter(
  options: MistralAdapterOptions = {}
): Promise<MistralAdapterHandle> {
  const apiKey = options.apiKey ?? getMistralApiKey()
  const apiBaseUrl = options.apiBaseUrl ?? getMistralApiBaseUrl()
  const port = options.port ?? MISTRAL_ADAPTER_PORT
  const host = options.host ?? MISTRAL_ADAPTER_HOST

  const requestUpstream = async (
    path: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response> => {
    return fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      body: JSON.stringify(body),
      signal
    })
  }

  const server = createServer((req, res) => {
    const url = (req.url ?? '').split('?')[0]
    const method = (req.method ?? 'GET').toUpperCase()

    if (method === 'GET' && (url === '/' || url === '')) {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Ollama is running')
      return
    }

    if (method === 'GET' && url === '/api/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ version: '0.30.0-mistral' }))
      return
    }

    if (method === 'GET' && url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(adapterModelInventory()))
      return
    }

    if (method === 'POST' && url === '/api/pull') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
      res.write(`${JSON.stringify({ status: 'pulling manifest' })}\n`)
      res.write(`${JSON.stringify({ status: 'verifying sha256 digest' })}\n`)
      res.write(`${JSON.stringify({ status: 'writing manifest' })}\n`)
      res.write(`${JSON.stringify({ status: 'success' })}\n`)
      res.end()
      return
    }

    if (url === '/api/delete' && (method === 'DELETE' || method === 'POST')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{}')
      return
    }

    void (async () => {
      const startedAt = Date.now()
      try {
        const body = await readJsonBody(req)

        if (url === '/api/embed') {
          const input = body.input
          const texts = Array.isArray(input)
            ? input.filter((entry): entry is string => typeof entry === 'string')
            : typeof input === 'string'
              ? [input]
              : []
          const upstream = await requestUpstream('/v1/embeddings', {
            model: getMistralEmbeddingModel(),
            input: texts
          })
          if (!upstream.ok) {
            const text = await upstream.text().catch(() => '')
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                error: `Mistral embeddings failed (${upstream.status}): ${text.slice(0, 200)}`
              })
            )
            return
          }
          const data = (await upstream.json()) as { data?: Array<{ embedding?: number[] }> }
          const embeddings = (data.data ?? [])
            .map((entry) => entry.embedding)
            .filter((entry): entry is number[] => Array.isArray(entry))
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({ model: body.model ?? DEFAULT_OLLAMA_EMBEDDING_MODEL, embeddings })
          )
          return
        }

        if (url === '/api/generate' || url === '/api/chat') {
          const wantsStream = body.stream !== false
          const isChat = url === '/api/chat'
          if (!isChat && body.prompt == null && body.keep_alive != null) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ done: true }))
            return
          }
          const mistralBody: MistralChatRequestBody = isChat
            ? ollamaChatToMistralChat(body as never)
            : ollamaGenerateToMistralChat(body as never)
          mistralBody.stream = wantsStream

          const controller = new AbortController()
          req.on('close', () => controller.abort())
          const upstream = await requestUpstream(
            '/v1/chat/completions',
            mistralBody,
            controller.signal
          )

          if (!upstream.ok) {
            const text = await upstream.text().catch(() => '')
            const message = `Mistral request failed (${upstream.status}): ${text.slice(0, 300)}`
            if (wantsStream) {
              res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
              res.write(`${JSON.stringify({ error: message })}\n`)
              res.end()
            } else {
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: message }))
            }
            return
          }

          if (wantsStream) {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
            await pipeMistralSseToOllamaNdjson(
              upstream,
              (line) => {
                res.write(`${JSON.stringify(line)}\n`)
              },
              startedAt
            )
            res.end()
            return
          }

          const data = (await upstream.json()) as {
            choices?: Array<{
              message?: {
                role?: string
                content?: string | null
                tool_calls?: MistralChatMessage['tool_calls']
              }
              finish_reason?: string
            }>
            usage?: { prompt_tokens?: number; completion_tokens?: number }
          }
          const choice = data.choices?.[0]
          const ollamaResponse: Record<string, unknown> = isChat
            ? {
                model: body.model ?? getMistralNotesModel(),
                created_at: new Date().toISOString(),
                message: mistralMessageToOllamaMessage({
                  role: choice?.message?.role ?? 'assistant',
                  content: choice?.message?.content ?? '',
                  tool_calls: choice?.message?.tool_calls
                }),
                done: true,
                done_reason: choice?.finish_reason === 'length' ? 'length' : 'stop',
                ...ollamaMetricsFromUsage(data.usage, Date.now() - startedAt)
              }
            : {
                model: body.model ?? getMistralNotesModel(),
                created_at: new Date().toISOString(),
                response: choice?.message?.content ?? '',
                done: true,
                done_reason: choice?.finish_reason === 'length' ? 'length' : 'stop',
                ...ollamaMetricsFromUsage(data.usage, Date.now() - startedAt)
              }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(ollamaResponse))
          return
        }

        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Unknown route ${method} ${url}` }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
        }
        res.end(JSON.stringify({ error: message }))
      }
    })()
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      logAutodocEvent({
        area: 'ollama',
        message: 'mistral ollama adapter listening',
        context: { host, port: boundPort }
      })
      resolve({
        server,
        port: boundPort,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()))
          })
      })
    })
  })
}

let mistralAdapterPromise: Promise<MistralAdapterHandle> | null = null

export function ensureMistralOllamaAdapter(): Promise<MistralAdapterHandle> {
  mistralAdapterPromise ??= startMistralOllamaAdapter()
  return mistralAdapterPromise
}

export async function closeMistralOllamaAdapter(): Promise<void> {
  const handle = mistralAdapterPromise
  mistralAdapterPromise = null
  if (!handle) return
  try {
    await (await handle).close()
  } catch {
    // Closing is best-effort; a stale loopback server is replaced on next start.
  }
}

/** Cheap credential check against the Mistral API before storing a key. */
export async function validateMistralApiKey(
  apiKey: string,
  apiBaseUrl = getMistralApiBaseUrl()
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(10_000)
    })
    return res.ok
  } catch {
    return false
  }
}

export function resetMistralOllamaAdapterForTests(): void {
  mistralAdapterPromise = null
}
