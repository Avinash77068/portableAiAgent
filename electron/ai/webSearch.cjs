const { log } = require('./logger.cjs')

const MAX_RESULTS = 5
const SEARCH_TIMEOUT_MS = 10000

// DuckDuckGo's HTML-only endpoint needs no API key, which matters for a
// portable app with no account/config step - but it's an unofficial scrape of
// their markup, not a documented API, so it can break if they change it.
const RESULT_PATTERN = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/g

const decodeHtmlEntities = (text) => text
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#x27;/g, '\'')
  .replace(/&nbsp;/g, ' ')

const stripTags = (html) => decodeHtmlEntities(html.replace(/<[^>]+>/g, '')).trim()

// DuckDuckGo wraps result links in a redirect (/l/?uddg=<encoded-real-url>).
const unwrapResultUrl = (href) => {
  try {
    const url = new URL(href, 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ? decodeURIComponent(target) : href
  } catch {
    return href
  }
}

const searchWeb = async (query) => {
  if (typeof query !== 'string' || !query.trim()) throw new Error('A search query is required')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; PortableAI/1.0)' },
    })
    if (!response.ok) throw new Error(`Web search failed (${response.status})`)
    const html = await response.text()

    const results = []
    for (const match of html.matchAll(RESULT_PATTERN)) {
      if (results.length >= MAX_RESULTS) break
      const [, href, titleHtml, snippetHtml] = match
      const title = stripTags(titleHtml)
      const snippet = stripTags(snippetHtml)
      if (!title) continue
      results.push({ title, snippet, url: unwrapResultUrl(href) })
    }

    return results
  } catch (error) {
    log(`Web search failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return []
  } finally {
    clearTimeout(timeout)
  }
}

// Search snippets for "current time in <place>" queries never contain a live
// clock value (it's rendered client-side on the target page, not present in
// DuckDuckGo's cached text) - but they very often state the UTC/GMT offset in
// plain text (e.g. "Tokyo runs on JST (UTC+9)"). Extracting that lets the exact
// current time be computed directly instead of trusting the model's own
// arithmetic, while staying fully general - no fixed list of places.
const OFFSET_PATTERN = /\b(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?\b/i

const extractUtcOffsetMinutes = (results) => {
  for (const result of results) {
    const match = `${result.title} ${result.snippet}`.match(OFFSET_PATTERN)
    if (!match) continue
    const sign = match[1] === '-' ? -1 : 1
    const hours = Number(match[2])
    const minutes = Number(match[3] ?? 0)
    return sign * (hours * 60 + minutes)
  }
  return null
}

module.exports = { searchWeb, extractUtcOffsetMinutes }
