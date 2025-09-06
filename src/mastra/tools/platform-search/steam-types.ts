import { z } from 'zod';

export interface SteamSearchParams {
  pages: ('demos' | 'recentlyreleased' | 'newandtrending')[];
  keywords: string[];
  detailed: boolean;
  maxResults: number;
  qualityThreshold: number;
}

export interface SteamDemo {
  title: string;
  appId: string;
  url: string;
  developer: string;
  publisher?: string;
  releaseDate?: string;
  reviewScore?: string;
  reviewCount?: number;
  description: string;
  tags?: string[];
  genres?: string[];
  platforms?: string[];
  screenshots?: string[];
  price?: string;
  languages?: string[];
}

// Two-step approach types (matching itch.io pattern)
export interface SteamGameListing {
  name: string;
  link: string;
  developer?: string;
}

export interface SteamDetailedGame extends SteamGameListing {
  title?: string;
  description?: string;
  fullDescription?: string;
  publisher?: string;
  tags?: string[];
  price?: string;
  discount?: string;
  releaseDate?: string;
  reviews?: {
    overall?: string;
    recent?: string;
    totalCount?: number;
  };
  screenshots?: string[];
  videos?: string[];
  systemRequirements?: {
    minimum?: string;
    recommended?: string;
  };
  features?: string[];
  languages?: string[];
  genres?: string[];
  achievements?: number;
  comments?: SteamComment[];
}

export interface SteamComment {
  author: string;
  content: string;
  date?: string;
  helpful?: number;
  isDevReply?: boolean;
  playtime?: string;
}

// Firecrawl extraction schema for Steam demos
export const steamDemoSchema = z.object({
  title: z.string().describe('The title of the game/demo'),
  appId: z.string().describe('Steam app ID for the game'),
  url: z.string().describe('The full URL to the Steam store page'),
  developer: z.string().describe('The name of the game developer'),
  publisher: z.string().optional().describe('The name of the game publisher'),
  releaseDate: z.string().optional().describe('Game release date'),
  reviewScore: z.string().optional().describe('User review score (e.g., "Very Positive", "Mixed")'),
  reviewCount: z.number().optional().describe('Number of user reviews'),
  description: z.string().describe('Game description'),
  tags: z.array(z.string()).optional().describe('User-defined tags for the game'),
  genres: z.array(z.string()).optional().describe('Steam genre categories'),
  platforms: z.array(z.string()).optional().describe('Supported platforms (Windows, Mac, Linux, Steam Deck)'),
  screenshots: z.array(z.string()).optional().describe('URLs of game screenshots'),
  price: z.string().optional().describe('Current price (demos are usually free, but shows main game price)'),
  languages: z.array(z.string()).optional().describe('Supported languages')
});

// Schema for extracting multiple demos from a page
export const steamDemosListSchema = z.object({
  demos: z.array(steamDemoSchema).describe('List of game demos found on the page')
});

// Search strategy schema specific to Steam
export const steamSearchStrategySchema = z.object({
  pages: z.array(z.enum(['demos', 'recentlyreleased', 'newandtrending'])).describe('Which Steam demo pages to search'),
  gameTypes: z.array(z.string()).optional().describe('Specific game types to focus on'),
  genres: z.array(z.string()).optional().describe('Steam genres to prioritize'),
  detailed: z.boolean().default(false).describe('Whether to fetch detailed information for each demo'),
  evaluation: z.object({
    relevanceKeywords: z.array(z.string()).describe('Keywords to boost relevance scoring'),
    exclusionKeywords: z.array(z.string()).describe('Keywords that should decrease relevance'),
    minimumScore: z.number().min(0).max(1).default(0.7).describe('Minimum relevance score threshold'),
    preferredReviewScore: z.enum(['Very Positive', 'Positive', 'Mixed', 'Any']).optional().describe('Preferred minimum review score')
  }).describe('Evaluation criteria for relevance scoring')
});

export type SteamSearchStrategy = z.infer<typeof steamSearchStrategySchema>;
export type SteamDemoData = z.infer<typeof steamDemoSchema>;
export type SteamDemosList = z.infer<typeof steamDemosListSchema>;

// Steam-specific utility types
export interface SteamPageUrls {
  demos: string;
  recentlyreleased: string;
  newandtrending: string;
}

export const STEAM_DEMO_URLS: SteamPageUrls = {
  demos: 'https://store.steampowered.com/demos/',
  recentlyreleased: 'https://store.steampowered.com/demos/?flavor=recentlyreleased',
  newandtrending: 'https://store.steampowered.com/demos/?flavor=contenthub_newandtrending'
};