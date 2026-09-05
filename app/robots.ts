import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.leomedpharma.in'
  const disallow = ['/account', '/account/', '/admin', '/admin/', '/api/', '/auth/']
  return {
    rules: [
      // Standard crawlers
      { userAgent: '*', allow: '/', disallow },
      // Google extended (AI training / SGE)
      { userAgent: 'Google-Extended', allow: '/', disallow },
      // OpenAI GPT
      { userAgent: 'GPTBot', allow: '/', disallow },
      { userAgent: 'ChatGPT-User', allow: '/', disallow },
      // Anthropic Claude
      { userAgent: 'ClaudeBot', allow: '/', disallow },
      { userAgent: 'claude-web', allow: '/', disallow },
      // Perplexity
      { userAgent: 'PerplexityBot', allow: '/', disallow },
      // Microsoft Bing / Copilot
      { userAgent: 'Bingbot', allow: '/', disallow },
      // Apple
      { userAgent: 'Applebot', allow: '/', disallow },
      { userAgent: 'Applebot-Extended', allow: '/', disallow },
      // Amazon Alexa
      { userAgent: 'Amazonbot', allow: '/', disallow },
      // Meta AI
      { userAgent: 'meta-externalagent', allow: '/', disallow },
      // Cohere
      { userAgent: 'cohere-ai', allow: '/', disallow },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
