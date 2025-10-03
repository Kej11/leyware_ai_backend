import { z } from 'zod';

// Available itch.io genres from the genre filter
export const ITCHIO_GENRES = [
  'action',
  'adventure',
  'card-game',
  'educational',
  'fighting',
  'interactive-fiction',
  'platformer',
  'puzzle',
  'racing',
  'rhythm',
  'role-playing',
  'shooter',
  'simulation',
  'sports',
  'strategy',
  'survival',
  'visual-novel',
  'other'
] as const;

export type ItchioGenre = typeof ITCHIO_GENRES[number];

// Genre URL mapping - uses new-and-popular sorting to get fresh, trending games
export const GENRE_URL_MAP: Record<ItchioGenre, string> = {
  'action': 'https://itch.io/games/new-and-popular/genre-action',
  'adventure': 'https://itch.io/games/new-and-popular/genre-adventure',
  'card-game': 'https://itch.io/games/new-and-popular/genre-card-game',
  'educational': 'https://itch.io/games/new-and-popular/genre-educational',
  'fighting': 'https://itch.io/games/new-and-popular/genre-fighting',
  'interactive-fiction': 'https://itch.io/games/new-and-popular/genre-interactive-fiction',
  'platformer': 'https://itch.io/games/new-and-popular/genre-platformer',
  'puzzle': 'https://itch.io/games/new-and-popular/genre-puzzle',
  'racing': 'https://itch.io/games/new-and-popular/genre-racing',
  'rhythm': 'https://itch.io/games/new-and-popular/genre-rhythm',
  'role-playing': 'https://itch.io/games/new-and-popular/genre-role-playing',
  'shooter': 'https://itch.io/games/new-and-popular/genre-shooter',
  'simulation': 'https://itch.io/games/new-and-popular/genre-simulation',
  'sports': 'https://itch.io/games/new-and-popular/genre-sports',
  'strategy': 'https://itch.io/games/new-and-popular/genre-strategy',
  'survival': 'https://itch.io/games/new-and-popular/genre-survival',
  'visual-novel': 'https://itch.io/games/new-and-popular/genre-visual-novel',
  'other': 'https://itch.io/games/new-and-popular/genre-other'
};

export interface ItchioSearchParams {
  pages: ('games' | 'new-and-popular' | 'newest')[];
  genres?: ItchioGenre[]; // Optional genre-specific search
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

// Genre selection schema
export interface GenreSelection {
  genre: ItchioGenre;
  confidence: number;
  reasoning: string;
}

export const genreSelectionSchema = z.object({
  selections: z.array(z.object({
    genre: z.enum(ITCHIO_GENRES),
    confidence: z.number().min(0).max(1).describe('Confidence score for this genre (0-1)'),
    reasoning: z.string().describe('Why this genre matches the scout mission')
  })).describe('Ranked list of relevant genres to search (up to 3)')
});