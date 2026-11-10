import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'http'
import {
  ollamaChatToMistralChat,
  ollamaFormatToMistralResponseFormat,
  ollamaGenerateToMistralChat,
  ollamaOptionsToMistralParams,
  startMistralOllamaAdapter,
  type MistralAdapterHandle
} from '../mistral-ollama-adapter'

describe('ollamaFormatToMistralResponseFormat', () => {
  it('maps json mode to json_object', () => {
    expect(ollamaFormatToMistralResponseFormat('json')).toEqual({ type: 'json_object' })
  })

  it('maps a JSON schema to json_schema', () => {
    const schema = { type: 'object', properties: { title: { type: 'string' } } }
    expect(ollamaFormatToMistralResponseFormat(schema)).toEqual({
      type: 'json_schema',
      json_schema: { name: 'autodoc_notes', schema }
    })
  })

  it('leaves unconstrained requests undefined', () => {
    expect(ollamaFormatToMistralResponseFormat(undefined)).toBeUndefined()
    expect(ollamaFormatToMistralResponseFormat(null)).toBeUndefined()
  })
})

describe('ollamaOptionsToMistralParams', () => {
  it('maps ollama sampling options to mistral parameters', () => {
    expect(
      ollamaOptionsToMistralParams({
        num_ctx: 8192,
        num_predict: 2048,
        temperature: 0.2,
        seed: 3,
        stop: ['\nUser:'],
        num_gpu: 99
      })
    ).toEqual({
      temperature: 0.2,
      max_tokens: 2048,
      random_seed: 3,
      stop: ['\nUser:']
    })
  })

  it('drops empty stop lists and invalid values', () => {
    expect(ollamaOptionsToMistralParams({ stop: [], num_predict: 0 })).toEqual({})
    expect(ollamaOptionsToMistralParams(undefined)).toEqual({})
  })
})

describe('ollamaGenerateToMistralChat', () => {
  it('builds system and user messages and maps options', () => {
    const request = ollamaGenerateToMistralChat({
      model: 'qwen3:4b-instruct',
      system: 'You write notes.',
      prompt: 'Transcript here',
      format: 'json',
      options: { num_predict: 512, temperature: 0 }
    })
    expect(request.messages).toEqual([
      { role: 'system', content: 'You write notes.' },
      { role: 'user', content: 'Transcript here' }
    ])
    expect(request.max_tokens).toBe(512)
    expect(request.response_format).toEqual({ type: 'json_object' })
  })
})

describe('ollamaChatToMistralChat', () => {
  it('translates ollama tool messages to mistral tool role messages', () => {
    const request = ollamaChatToMistralChat({
      messages: [
        { role: 'system', content: 'sys' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'search', arguments: '{"q":"budget"}' } }]
        },
        { role: 'tool', tool_name: 'search', content: '{"ok":true}' }
      ]
    })
    expect(request.messages).toEqual([
      { role: 'system', content: 'sys' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_0',
            type: 'function',
            function: { name: 'search', arguments: '{"q":"budget"}' }
          }
        ]
      },
      { role: 'tool', content: '{"ok":true}', name: 'search' }
    ])
  })

  it('passes tools and json format through', () => {
    const tools = [
      {
        type: 'function',
        function: { name: 'search', description: 'Search notes', parameters: { type: 'object' } }
      }
    ]
    const request = ollamaChatToMistralChat({
      messages: [{ role: 'user', content: 'hi' }],
      tools,
      format: 'json',
      options: { temperature: 0, num_ctx: 2048, num_predict: 512 }
    })
    expect(request.tools).toEqual(tools)
    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.max_tokens).toBe(512)
  })
})

describe('mistral ollama adapter server', () => {
  let upstream: Server
  let upstreamBaseUrl: string
  let adapter: MistralAdapterHandle

  const lastUpstreamRequests: Array<{ url: string; body: Record<string, unknown> }> = []

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(chunk as Buffer))
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
        lastUpstreamRequests.push({ url: req.url ?? '', body })

        if (req.url === '/v1/embeddings') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }))
          return
        }

        if (body.stream === true) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' })
          res.write('data: {"choices":[{"delta":{"content":"{\\"dec"}}]}\n\n')
          res.write('data: {"choices":[{"delta":{"content":"isions\\":[\\":[\\"ok\\"]"}}]}\n\n')
          res.write(
            'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":4}}\n\n'
          )
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', content: 'The budget is $5,000.' },
                finish_reason: 'stop'
              }
            ],
            usage: { prompt_tokens: 7, completion_tokens: 6 }
          })
        )
      })
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const upstreamAddress = upstream.address()
    if (typeof upstreamAddress !== 'object' || upstreamAddress == null)
      throw new Error('upstream failed to start')
    upstreamBaseUrl = `http://127.0.0.1:${upstreamAddress.port}`

    adapter = await startMistralOllamaAdapter({
      port: 0,
      apiKey: 'test-key',
      apiBaseUrl: upstreamBaseUrl
    })
  })

  afterAll(async () => {
    await adapter.close()
    await new Promise<void>((resolve) => upstream.close(() => resolve()))
  })

  it('serves the model inventory on /api/tags', async () => {
    const res = await fetch(`http://127.0.0.1:${adapter.port}/api/tags`)
    expect(res.ok).toBe(true)
    const data = (await res.json()) as { models: Array<{ name: string }> }
    expect(data.models.map((entry) => entry.name)).toContain('qwen3:4b-instruct')
    expect(data.models.map((entry) => entry.name)).toContain('qwen3-embedding:0.6b')
  })

  it('streams a generate request as ollama ndjson', async () => {
    const res = await fetch(`http://127.0.0.1:${adapter.port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:4b-instruct',
        prompt: 'Transcript',
        stream: true,
        format: 'json',
        options: { num_predict: 256, temperature: 0, num_ctx: 4096 }
      })
    })
    expect(res.ok).toBe(true)
    const text = await res.text()
    const lines = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>)
    const content = lines.map((line) => line.response ?? '').join('')
    expect(content).toBe('{"decisions":[":["ok"]')
    const finalLine = lines[lines.length - 1]
    expect(finalLine.done).toBe(true)
    expect(finalLine.eval_count).toBe(4)
    expect(finalLine.prompt_eval_count).toBe(10)

    const upstreamRequest = lastUpstreamRequests[lastUpstreamRequests.length - 1]
    expect(upstreamRequest.url).toBe('/v1/chat/completions')
    expect((upstreamRequest.body as { stream: boolean }).stream).toBe(true)
    expect((upstreamRequest.body as { max_tokens: number }).max_tokens).toBe(256)
  })

  it('serves a non-streaming chat completion in ollama shape', async () => {
    const res = await fetch(`http://127.0.0.1:${adapter.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3:4b-instruct',
        messages: [{ role: 'user', content: 'What is the budget?' }],
        stream: false,
        options: { temperature: 0, num_predict: 512 }
      })
    })
    expect(res.ok).toBe(true)
    const data = (await res.json()) as { message?: { content?: string }; done?: boolean }
    expect(data.message?.content).toBe('The budget is $5,000.')
    expect(data.done).toBe(true)
  })

  it('translates embeddings', async () => {
    const res = await fetch(`http://127.0.0.1:${adapter.port}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3-embedding:0.6b', input: ['first', 'second'] })
    })
    expect(res.ok).toBe(true)
    const data = (await res.json()) as { embeddings: number[][] }
    expect(data.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4]
    ])
    const upstreamRequest = lastUpstreamRequests[lastUpstreamRequests.length - 1]
    expect(upstreamRequest.url).toBe('/v1/embeddings')
    expect((upstreamRequest.body as { input: string[] }).input).toEqual(['first', 'second'])
  })

  it('answers keep_alive unload requests without contacting mistral', async () => {
    const before = lastUpstreamRequests.length
    const res = await fetch(`http://127.0.0.1:${adapter.port}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3:4b-instruct', keep_alive: 0 })
    })
    expect(res.ok).toBe(true)
    expect(await res.json()).toEqual({ done: true })
    expect(lastUpstreamRequests.length).toBe(before)
  })
})
