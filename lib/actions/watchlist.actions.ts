'use server';

import { connectToDatabase } from '@/database/mongoose';
import { Watchlist } from '@/database/models/watchlist.model';

export const getWatchlistSymbolsByEmail = async (
  email: string
): Promise<string[]> => {
  try {
    if (!email) {
      return [];
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if (!db) {
      console.error('Database connection not available');
      return [];
    }

    // Find user in Better Auth users collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({
      email
    });

    if (!user || !user.id) {
      return [];
    }

    // Query watchlist by userId and get symbols
    const watchlistItems = await Watchlist.find(
      { userId: user.id },
      { symbol: 1, _id: 0 }
    ).exec();

    const symbols = watchlistItems.map((item) => item.symbol);
    return symbols;
  } catch (error) {
    console.error('Error fetching watchlist symbols:', error);
    return [];
  }
};
