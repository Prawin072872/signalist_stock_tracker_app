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

export const addToWatchlist = async (
  email: string,
  symbol: string,
  company: string
): Promise<{ success: boolean; message: string }> => {
  try {
    if (!email || !symbol || !company) {
      return { success: false, message: 'Missing required fields' };
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if (!db) {
      console.error('Database connection not available');
      return { success: false, message: 'Database connection failed' };
    }

    // Find user in Better Auth users collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({
      email
    });

    if (!user || !user.id) {
      return { success: false, message: 'User not found' };
    }

    // Add to watchlist
    await Watchlist.create({
      userId: user.id,
      symbol: symbol.toUpperCase(),
      company
    });

    return { success: true, message: 'Added to watchlist' };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false, message: 'Already in watchlist' };
    }
    console.error('Error adding to watchlist:', error);
    return { success: false, message: 'Failed to add to watchlist' };
  }
};

export const removeFromWatchlist = async (
  email: string,
  symbol: string
): Promise<{ success: boolean; message: string }> => {
  try {
    if (!email || !symbol) {
      return { success: false, message: 'Missing required fields' };
    }

    const mongoose = await connectToDatabase();
    const db = mongoose.connection.db;

    if (!db) {
      console.error('Database connection not available');
      return { success: false, message: 'Database connection failed' };
    }

    // Find user in Better Auth users collection
    const user = await db.collection('user').findOne<{ _id?: unknown; id?: string; email?: string }>({
      email
    });

    if (!user || !user.id) {
      return { success: false, message: 'User not found' };
    }

    // Remove from watchlist
    await Watchlist.findOneAndDelete({
      userId: user.id,
      symbol: symbol.toUpperCase()
    });

    return { success: true, message: 'Removed from watchlist' };
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return { success: false, message: 'Failed to remove from watchlist' };
  }
};
