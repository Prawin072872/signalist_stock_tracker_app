'use client';

import { POPULAR_STOCK_SYMBOLS } from '@/lib/constants';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? '';

/**
 * Client-side fetch that works reliably from the browser
 * Bypasses Node.js connection issues entirely
 */
async function fetchFinnhub<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API Error ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function searchStocksClient(
  query?: string
): Promise<StockWithWatchlistStatus[]> {
  try {
    if (!FINNHUB_API_KEY) {
      throw new Error('FINNHUB API key is not configured');
    }

    const trimmed = typeof query === 'string' ? query.trim() : '';
    let results: FinnhubSearchResult[] = [];

    if (!trimmed) {
      // Fetch top 10 popular symbols' profiles
      const top = POPULAR_STOCK_SYMBOLS.slice(0, 10);
      const profiles = await Promise.all(
        top.map(async (sym) => {
          try {
            const url = `${FINNHUB_BASE_URL}/stock/profile2?symbol=${encodeURIComponent(
              sym
            )}&token=${FINNHUB_API_KEY}`;
            const profile = await fetchFinnhub<any>(url);
            return { sym, profile } as { sym: string; profile: any };
          } catch (e) {
            console.error('Error fetching profile for', sym, e);
            return { sym, profile: null } as { sym: string; profile: any };
          }
        })
      );

      results = profiles
        .map(({ sym, profile }) => {
          const symbol = sym.toUpperCase();
          const name: string | undefined =
            profile?.name || profile?.ticker || undefined;
          const exchange: string | undefined = profile?.exchange || undefined;
          if (!name) return undefined;
          const r: FinnhubSearchResult = {
            symbol,
            description: name,
            displaySymbol: symbol,
            type: 'Common Stock',
          };
          (r as any).__exchange = exchange;
          return r;
        })
        .filter((x): x is FinnhubSearchResult => Boolean(x));
    } else {
      const url = `${FINNHUB_BASE_URL}/search?q=${encodeURIComponent(
        trimmed
      )}&token=${FINNHUB_API_KEY}`;
      const data = await fetchFinnhub<FinnhubSearchResponse>(url);
      results = Array.isArray(data?.result) ? data.result : [];
    }

    const mapped: StockWithWatchlistStatus[] = results
      .map((r) => {
        const upper = (r.symbol || '').toUpperCase();
        const name = r.description || upper;
        const exchangeFromDisplay =
          (r.displaySymbol as string | undefined) || undefined;
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
    console.error('Client-side stock search error:', err);
    return [];
  }
}
