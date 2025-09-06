import { z } from 'zod';

export interface ItchioSearchParams {
  pages: ('games' | 'new-and-popular' | 'newest')[];
  keywords: string[];
  detailed: boolean;
  maxResults: number;
  qualityThreshold: number;
}

export interface ItchioGame {
  title: string;
  url: string;
  developer: string;
  price: string;
  description: string;
  tags?: string[];
  screenshots?: string[];
  downloads?: string;
  platforms?: string[];
  rating?: string;
  createdDate?: string;
}

// Firecrawl extraction schema for itch.io games
export const itchioGameSchema = z.object({
  title: z.string().describe('The title of the game'),
  url: z.string().describe('The full URL to the game page on itch.io'),
  developer: z.string().describe('The name of the game developer/creator'),
  price: z.string().describe('The price of the game (e.g., "Free", "$5.99", "Name your own price")'),
  description: z.string().describe('A brief description of the game'),
  tags: z.array(z.string()).optional().describe('Genre/category tags for the game'),
  screenshots: z.array(z.string()).optional().describe('URLs of game screenshots'),
  downloads: z.string().optional().describe('Number of downloads if visible'),
  platforms: z.array(z.string()).optional().describe('Supported platforms (Windows, Mac, Linux, etc.)'),
  rating: z.string().optional().describe('User rating if available'),
  createdDate: z.string().optional().describe('Game creation/publication date')
});

// Schema for extracting multiple games from a page
export const itchioGamesListSchema = z.object({
  games: z.array(itchioGameSchema).describe('List of games found on the page')
});

// Search strategy schema specific to itch.io
export const itchioSearchStrategySchema = z.object({
  pages: z.array(z.enum(['games', 'new-and-popular', 'newest'])).describe('Which itch.io pages to search'),
  categories: z.array(z.string()).optional().describe('Specific game categories to focus on'),
  priceFilter: z.enum(['all', 'free', 'paid', 'pwyw']).default('all').describe('Price filter preference'),
  detailed: z.boolean().default(false).describe('Whether to fetch detailed information for each game'),
  evaluation: z.object({
    relevanceKeywords: z.array(z.string()).describe('Keywords to boost relevance scoring'),
    exclusionKeywords: z.array(z.string()).describe('Keywords that should decrease relevance'),
    minimumScore: z.number().min(0).max(1).default(0.7).describe('Minimum relevance score threshold')
  }).describe('Evaluation criteria for relevance scoring')
});

export type ItchioSearchStrategy = z.infer<typeof itchioSearchStrategySchema>;
export type ItchioGameData = z.infer<typeof itchioGameSchema>;
export type ItchioGamesList = z.infer<typeof itchioGamesListSchema>;