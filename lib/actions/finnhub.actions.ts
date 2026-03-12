'use server';

import { getDateRange, validateArticle, formatArticle } from '@/lib/utils';
import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';
import { cache } from 'react';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

async function fetchJSON<T>(url: string, revalidateSeconds?: number): Promise<T> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finnhub.io/',
    'Connection': 'close', // Force connection to close after response
  };

  let lastError: Error | null = null;

  // Retry with exponential backoff - more aggressive for connection issues
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Use AbortSignal to enforce timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout

      try {
        const options: RequestInit & { next?: { revalidate?: number } } = {
          headers,
          signal: controller.signal,
          // Only use cache on retry attempts (not on first attempt)
          ...(attempt === 0 && revalidateSeconds
            ? { cache: 'force-cache', next: { revalidate: revalidateSeconds } }
            : { cache: 'no-store' }),
        };

        const res = await fetch(url, options);
        clearTimeout(timeoutId);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Fetch failed ${res.status}: ${text}`);
        }

        return (await res.json()) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isConnectionError =
        lastError.message.includes('fetch failed') ||
        lastError.message.includes('ECONNRESET') ||
        lastError.message.includes('AbortError');

      if (!isConnectionError) {
        // Don't retry on application errors
        throw lastError;
      }

      if (attempt < 4) {
        // Exponential backoff with jitter: 500ms, 1s, 2s, 4s
        const baseDelay = Math.pow(2, attempt) * 500;
        const jitter = Math.random() * 500;
        const delay = baseDelay + jitter;
        
        console.debug(`Attempt ${attempt + 1}/5 failed, retrying in ${Math.round(delay)}ms:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.error('All 5 fetch attempts failed for URL:', url, 'Last error:', lastError?.message);
  throw lastError || new Error('Failed to fetch after 5 retries');
}

export { fetchJSON };

export async function getNews(symbols?: string[]): Promise<MarketNewsArticle[]> {
  try {
    const range = getDateRange(5);
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      throw new Error('FINNHUB API key is not configured');
    }
    const cleanSymbols = (symbols || [])
      .map((s) => s?.trim().toUpperCase())
      .filter((s): s is string => Boolean(s));

    const maxArticles = 6;

    // If we have symbols, try to fetch company news per symbol and round-robin select
    if (cleanSymbols.length > 0) {
      const perSymbolArticles: Record<string, RawNewsArticle[]> = {};

      await Promise.all(
        cleanSymbols.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${encodeURIComponent(sym)}&from=${range.from}&to=${range.to}&token=${token}`;
            const articles = await fetchJSON<RawNewsArticle[]>(url, 300);
            perSymbolArticles[sym] = (articles || []).filter(validateArticle);
          } catch (e) {
            console.error('Error fetching company news for', sym, e);
            perSymbolArticles[sym] = [];
          }
        })
      );

      const collected: MarketNewsArticle[] = [];
      // Round-robin up to 6 picks
      for (let round = 0; round < maxArticles; round++) {
        for (let i = 0; i < cleanSymbols.length; i++) {
          const sym = cleanSymbols[i];
          const list = perSymbolArticles[sym] || [];
          if (list.length === 0) continue;
          const article = list.shift();
          if (!article || !validateArticle(article)) continue;
          collected.push(formatArticle(article, true, sym, round));
          if (collected.length >= maxArticles) break;
        }
        if (collected.length >= maxArticles) break;
      }

      if (collected.length > 0) {
        // Sort by datetime desc
        collected.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
        return collected.slice(0, maxArticles);
      }
      // If none collected, fall through to general news
    }

    // General market news fallback or when no symbols provided
    const generalUrl = `${FINNHUB_BASE_URL}/news?category=general&token=${token}`;
    const general = await fetchJSON<RawNewsArticle[]>(generalUrl, 300);

    const seen = new Set<string>();
    const unique: RawNewsArticle[] = [];
    for (const art of general || []) {
      if (!validateArticle(art)) continue;
      const key = `${art.id}-${art.url}-${art.headline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(art);
      if (unique.length >= 20) break; // cap early before final slicing
    }

    const formatted = unique.slice(0, maxArticles).map((a, idx) => formatArticle(a, false, undefined, idx));
    return formatted;
  } catch (err) {
    console.error('getNews error:', err);
    throw new Error('Failed to fetch news');
  }
}

export const searchStocks = cache(async (query?: string): Promise<StockWithWatchlistStatus[]> => {
  try {
    const token = process.env.FINNHUB_API_KEY ?? NEXT_PUBLIC_FINNHUB_API_KEY;
    if (!token) {
      // If no token, log and return empty to avoid throwing per requirements
      console.error('Error in stock search:', new Error('FINNHUB API key is not configured'));
      return [];
    }

    const trimmed = typeof query === 'string' ? query.trim() : '';

    let results: FinnhubSearchResult[] = [];

    if (!trimmed) {
      // Fetch top 10 popular symbols' profiles
      const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
      const profiles = await Promise.all(
        top.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(sym)}&token=${token}`;
            // Revalidate every hour
            const profile = await fetchJSON<any>(url, 3600);
            return { sym, profile } as { sym: string; profile: any };
          } catch (e) {
            console.error('Error fetching profile2 for', sym, e);
            return { sym, profile: null } as { sym: string; profile: any };
          }
        })
      );

      results = profiles
        .map(({ sym, profile }) => {
          const symbol = sym.toUpperCase();
          const name: string | undefined = profile?.name || profile?.ticker || undefined;
          const exchange: string | undefined = profile?.exchange || undefined;
          if (!name) return undefined;
          const r: FinnhubSearchResult = {
            symbol,
            description: name,
            displaySymbol: symbol,
            type: 'Common Stock',
          };
          // We don't include exchange in FinnhubSearchResult type, so carry via mapping later using profile
          // To keep pipeline simple, attach exchange via closure map stage
          // We'll reconstruct exchange when mapping to final type
          (r as any).__exchange = exchange; // internal only
          return r;
        })
        .filter((x): x is FinnhubSearchResult => Boolean(x));
    } else {
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(trimmed)}&token=${token}`;
      const data = await fetchJSON<FinnhubSearchResponse>(url, 1800);
      results = Array.isArray(data?.result) ? data.result : [];
    }

    const mapped: StockWithWatchlistStatus[] = results
      .map((r) => {
        const upper = (r.symbol || '').toUpperCase();
        const name = r.description || upper;
        const exchangeFromDisplay = (r.displaySymbol as string | undefined) || undefined;
        const exchangeFromProfile = (r as any).__exchange as string | undefined;
        const exchange = exchangeFromDisplay || exchangeFromProfile || 'US';
        const type = r.type || 'Stock';
        const item: StockWithWatchlistStatus = {
          symbol: upper,
          name,
          exchange,
          type,
          isInWatchlist: false,
        };
        return item;
      })
      .slice(0, 15);

    return mapped;
  } catch (err) {
    console.error('Error in stock search:', err);
    return [];
  }
});
