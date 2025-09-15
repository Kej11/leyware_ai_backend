import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BasePlatformSearchTool } from './base-search-tool';
import { PlatformSearchResult, SearchStrategy } from '../../database/schemas';
import { rateLimitedFirecrawl } from './firecrawl-client';
import { 
  SteamSearchParams, 
  SteamDemo, 
  steamDemosListSchema,
  STEAM_DEMO_URLS,
  SteamSearchStrategy,
  SteamGameListing,
  SteamDetailedGame,
  SteamComment
} from './steam-types';

export class SteamSearchTool extends BasePlatformSearchTool {
  platform = 'steam';
  
  // Helper method for structured logging - logs to both console and potential structured logger
  private log(level: 'info' | 'warn' | 'error', message: string, metadata?: any) {
    const logData = { platform: this.platform, ...metadata };
    
    // Structured logging format for console
    if (level === 'info') {
      console.log(`[Steam Search] ${message}`, logData);
    } else if (level === 'warn') {
      console.warn(`[Steam Search] ${message}`, logData);
    } else {
      console.error(`[Steam Search] ${message}`, logData);
    }
  }

  async search(strategy: SearchStrategy): Promise<PlatformSearchResult[]> {
    const { search_params } = strategy;
    const { pages, keywords, detailed, maxResults, qualityThreshold } = search_params;
    
    const results: PlatformSearchResult[] = [];
    
    this.log('info', 'Starting Steam demo search', { 
      pagesCount: pages.length,
      keywords: keywords,
      maxResults: maxResults,
      qualityThreshold: qualityThreshold
    });
    
    for (const page of pages) {
      try {
        const url = STEAM_DEMO_URLS[page as keyof typeof STEAM_DEMO_URLS];
        if (!url) {
          this.log('warn', 'Unknown Steam demo page', { page: page });
          continue;
        }

        this.log('info', 'Scraping Steam demo page', { page: page, url: url });
        
        const scrapeResult = await rateLimitedFirecrawl.scrapeWithDelay(url, {
          formats: [{
            type: "json",
            prompt: "Extract list of game demos with titles, developers, reviews, prices, descriptions, tags, and other demo information from this Steam demo page",
            schema: {
              type: "object",
              properties: {
                demos: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "Game title" },
                      appId: { type: "string", description: "Steam app ID" },
                      url: { type: "string", description: "Full URL to the Steam store page" },
                      developer: { type: "string", description: "Developer company name" },
                      publisher: { type: "string", description: "Publisher company name" },
                      releaseDate: { type: "string", description: "Release date" },
                      reviewScore: { type: "string", description: "Review score (Very Positive, Mixed, etc.)" },
                      reviewCount: { type: "number", description: "Number of reviews" },
                      description: { type: "string", description: "Game description" },
                      tags: { type: "array", items: { type: "string" }, description: "Steam tags" },
                      genres: { type: "array", items: { type: "string" }, description: "Game genres" },
                      platforms: { type: "array", items: { type: "string" }, description: "Supported platforms" },
                      screenshots: { type: "array", items: { type: "string" }, description: "Screenshot URLs" },
                      price: { type: "string", description: "Current price" },
                      languages: { type: "array", items: { type: "string" }, description: "Supported languages" }
                    },
                    required: ["title", "url", "developer"]
                  }
                }
              },
              required: ["demos"]
            }
          }]
        });
        
        if (scrapeResult?.json?.demos) {
          const demos = scrapeResult.json.demos;
          this.log('info', 'Found demos on page', { 
            page: page,
            demosCount: demos.length
          });
          
          for (const demo of demos) {
            // Apply keyword filtering
            const matchesKeywords = this.matchesKeywords(demo, keywords);
            if (!matchesKeywords) continue;

            const platformResult: PlatformSearchResult = {
              platform: 'steam',
              source_url: demo.url,
              title: demo.title,
              content: this.normalizeContent(demo.description),
              author: demo.developer,
              author_url: `https://store.steampowered.com/search/?developer=${encodeURIComponent(demo.developer)}`,
              engagement_score: this.calculateEngagementScore({
                reviewScore: demo.reviewScore,
                reviewCount: demo.reviewCount,
                tags: demo.tags,
                platforms: demo.platforms,
                releaseDate: demo.releaseDate
              }),
              metadata: {
                appId: demo.appId,
                developer: demo.developer,
                publisher: demo.publisher,
                releaseDate: demo.releaseDate,
                reviewScore: demo.reviewScore,
                reviewCount: demo.reviewCount,
                tags: demo.tags || [],
                genres: demo.genres || [],
                platforms: demo.platforms || [],
                screenshots: demo.screenshots || [],
                price: demo.price,
                languages: demo.languages || [],
                page_source: page
              },
              created_at: new Date().toISOString()
            };

            results.push(platformResult);
            
            // Stop if we've reached maxResults
            if (results.length >= maxResults) {
              this.log('info', 'Reached maximum results limit', { maxResults: maxResults });
              break;
            }
          }
        } else {
          this.log('warn', 'No demos found on page', { page: page });
        }
        
        // Stop if we've reached maxResults
        if (results.length >= maxResults) break;
        
      } catch (error) {
        this.log('error', 'Error scraping Steam demo page', { 
          page: page,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }
    
    this.log('info', 'Steam demo search completed', { totalResults: results.length });
    return results;
  }

  validateConfig(config: any): boolean {
    return (
      config &&
      Array.isArray(config.steamPages) &&
      config.steamPages.length > 0
    );
  }

  private matchesKeywords(demo: SteamDemo, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return true;
    
    const searchText = `
      ${demo.title} 
      ${demo.description} 
      ${demo.tags?.join(' ') || ''} 
      ${demo.genres?.join(' ') || ''}
      ${demo.developer}
    `.toLowerCase();
    
    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
  }

  protected calculateEngagementScore(metadata: any): number {
    const { 
      reviewScore, 
      reviewCount = 0, 
      tags = [], 
      platforms = [], 
      releaseDate 
    } = metadata;
    
    let score = 0;
    
    // Review score scoring
    if (reviewScore) {
      const scoreMap: Record<string, number> = {
        'overwhelmingly positive': 10,
        'very positive': 8,
        'positive': 6,
        'mostly positive': 5,
        'mixed': 3,
        'mostly negative': 1,
        'negative': 0,
        'very negative': 0,
        'overwhelmingly negative': 0
      };
      score += scoreMap[reviewScore.toLowerCase()] || 0;
    }
    
    // Review count scoring (more reviews = more engagement)
    if (reviewCount > 10000) score += 4;
    else if (reviewCount > 1000) score += 3;
    else if (reviewCount > 100) score += 2;
    else if (reviewCount > 10) score += 1;
    
    // Tags scoring (more tags = more discoverable)
    score += Math.min(tags.length * 0.3, 2);
    
    // Platform support scoring (multi-platform = wider appeal)
    score += Math.min(platforms.length * 0.5, 2);
    
    // Recency scoring (newer games might be more relevant)
    if (releaseDate) {
      const releaseYear = new Date(releaseDate).getFullYear();
      const currentYear = new Date().getFullYear();
      const yearsDiff = currentYear - releaseYear;
      
      if (yearsDiff <= 1) score += 2;      // Last year
      else if (yearsDiff <= 3) score += 1; // Last 3 years
    }
    
    return Math.min(Math.round(score * 5), 100); // Cap at 100
  }

  // Two-step approach methods (matching itch.io pattern)
  async scrapeGameListings(strategy: SearchStrategy): Promise<SteamGameListing[]> {
    const { search_params } = strategy;
    const { pages, maxResults } = search_params;
    
    this.log('info', 'Step 1: Scraping Steam game listings', { 
      pagesCount: pages.length,
      maxResults: maxResults
    });
    
    // Use the demos page with offset parameter
    const url = `https://store.steampowered.com/demos/?flavor=recentlyreleased&offset=48`;
    
    try {
      const listingSchema = {
        type: "object",
        properties: {
          games: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                link: { type: "string" },
                developer: { type: "string" }
              },
              required: ["name", "link"]
            }
          }
        },
        required: ["games"]
      };

      this.log('info', 'Scraping listings from URL', { url: url });
      
      const result = await rateLimitedFirecrawl.scrapeWithDelay(url, {
        formats: ['json'],
        jsonOptions: { schema: listingSchema }
      });

      if (result?.json?.games) {
        const listings = result.json.games.slice(0, maxResults);
        this.log('info', 'Found game listings', { count: listings.length });
        return listings;
      } else {
        this.log('warn', 'No games found in listings scrape');
        return [];
      }
    } catch (error) {
      this.log('error', 'Error scraping Steam listings', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  async scrapeDetailedGames(gameUrls: string[]): Promise<SteamDetailedGame[]> {
    this.log('info', 'Step 2: Scraping detailed info for games', { gamesCount: gameUrls.length });
    
    const detailedGames: SteamDetailedGame[] = [];
    const DELAY_BETWEEN_REQUESTS = 6000; // 6 seconds between requests
    
    for (let i = 0; i < gameUrls.length; i++) {
      const url = gameUrls[i];
      this.log('info', 'Scraping game details', { 
        index: i + 1,
        total: gameUrls.length,
        url: url
      });
      
      try {
        const detailedSchema = {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            fullDescription: { type: "string" },
            developer: { type: "string" },
            publisher: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            price: { type: "string" },
            discount: { type: "string" },
            releaseDate: { type: "string" },
            reviews: {
              type: "object",
              properties: {
                overall: { type: "string" },
                recent: { type: "string" },
                totalCount: { type: "number" }
              }
            },
            screenshots: { type: "array", items: { type: "string" } },
            videos: { type: "array", items: { type: "string" } },
            systemRequirements: {
              type: "object",
              properties: {
                minimum: { type: "string" },
                recommended: { type: "string" }
              }
            },
            features: { type: "array", items: { type: "string" } },
            languages: { type: "array", items: { type: "string" } },
            genres: { type: "array", items: { type: "string" } },
            achievements: { type: "number" },
            comments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  author: { type: "string" },
                  content: { type: "string" },
                  date: { type: "string" },
                  helpful: { type: "number" },
                  isDevReply: { type: "boolean" },
                  playtime: { type: "string" }
                },
                required: ["author", "content"]
              }
            }
          }
        };

        const result = await rateLimitedFirecrawl.scrapeWithDelay(url, {
          formats: ['json'],
          jsonOptions: { schema: detailedSchema }
        });

        if (result?.json) {
          const gameData: SteamDetailedGame = {
            name: result.json.title || url.split('/').pop()?.replace(/_/g, ' ') || 'Unknown Game',
            link: url,
            ...result.json
          };
          
          detailedGames.push(gameData);
          this.log('info', 'Successfully scraped game', { gameName: gameData.name });
        } else {
          this.log('warn', 'No detailed data found for game', { url: url });
        }

      } catch (error) {
        this.log('error', 'Error scraping detailed game', { 
          url: url,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Rate limiting delay
      if (i < gameUrls.length - 1) {
        this.log('info', 'Rate limiting delay', { delaySeconds: DELAY_BETWEEN_REQUESTS/1000 });
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
      }
    }
    
    this.log('info', 'Detailed scraping complete', { 
      successful: detailedGames.length,
      total: gameUrls.length,
      successRate: `${((detailedGames.length / gameUrls.length) * 100).toFixed(1)}%`
    });
    return detailedGames;
  }
}

export const steamSearchTool = createTool({
  id: 'steam-search',
  description: 'Search Steam for game demos based on strategy',
  inputSchema: z.object({
    strategy: z.object({
      platform: z.literal('steam'),
      search_params: z.object({
        pages: z.array(z.string()),
        keywords: z.array(z.string()),
        detailed: z.boolean().default(false),
        maxResults: z.number().default(25),
        qualityThreshold: z.number().default(0.4)
      }),
      expanded_keywords: z.array(z.string()),
      reasoning: z.string()
    })
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      platform: z.string(),
      source_url: z.string(),
      title: z.string(),
      content: z.string(),
      author: z.string(),
      author_url: z.string().optional(),
      engagement_score: z.number(),
      metadata: z.any(),
      created_at: z.string()
    })),
    total_searched: z.number()
  }),
  execute: async ({ context }) => {
    const tool = new SteamSearchTool();
    const results = await tool.search(context.strategy);
    
    return {
      results,
      total_searched: results.length
    };
  }
});