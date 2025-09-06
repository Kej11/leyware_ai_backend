import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BasePlatformSearchTool } from './base-search-tool';
import { PlatformSearchResult, SearchStrategy, GameListing, DetailedGame } from '../../database/schemas';
import { rateLimitedFirecrawl } from './firecrawl-client';
import { 
  ItchioSearchParams, 
  ItchioGame, 
  itchioGamesListSchema,
  ItchioSearchStrategy 
} from './itchio-types';

export class ItchioSearchTool extends BasePlatformSearchTool {
  platform = 'itchio';

  async search(strategy: SearchStrategy): Promise<PlatformSearchResult[]> {
    const { search_params } = strategy;
    const { pages, keywords, detailed, maxResults, qualityThreshold } = search_params;
    
    const results: PlatformSearchResult[] = [];
    
    console.log(`🎮 Starting itch.io search across ${pages.length} pages...`);
    
    // Base URLs for different itch.io pages
    const baseUrls = {
      'games': 'https://itch.io/games',
      'new-and-popular': 'https://itch.io/games/new-and-popular',
      'newest': 'https://itch.io/games/newest'
    };
    
    for (const page of pages) {
      try {
        const url = baseUrls[page as keyof typeof baseUrls];
        if (!url) {
          console.warn(`⚠️ Unknown itch.io page: ${page}`);
          continue;
        }

        console.log(`🎮 Scraping itch.io page: ${page} (${url})`);
        
        // Use simple scrape with flexible schema - much faster and more reliable
        const scrapeResult = await rateLimitedFirecrawl.scrapeWithDelay(url, {
          formats: [{
            type: "json",
            prompt: "get any games you can find on this page",
            schema: {
              type: "object",
              properties: {
                games: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      developer: { type: "string" },
                      price: { type: "string" },
                      description: { type: "string" },
                      url: { type: "string" }
                    }
                  }
                }
              }
            }
          }]
        });
        
        // Simple scrape returns json directly
        if (scrapeResult?.json?.games) {
          const games = scrapeResult.json.games;
          console.log(`📦 Found ${games.length} games on ${page} page`);
          
          for (const game of games) {
            // Apply keyword filtering
            const matchesKeywords = this.matchesKeywords(game, keywords);
            if (!matchesKeywords) continue;

            const platformResult: PlatformSearchResult = {
              platform: 'itchio',
              source_url: game.url,
              title: game.title,
              content: this.normalizeContent(game.description),
              author: game.developer,
              author_url: `https://itch.io/profile/${game.developer.toLowerCase().replace(/\s+/g, '-')}`,
              engagement_score: this.calculateEngagementScore({
                downloads: game.downloads,
                rating: game.rating,
                price: game.price,
                tags_count: game.tags?.length || 0
              }),
              metadata: {
                price: game.price,
                tags: game.tags || [],
                platforms: game.platforms || [],
                screenshots: game.screenshots || [],
                downloads: game.downloads,
                rating: game.rating,
                created_date: game.createdDate,
                page_source: page
              },
              created_at: new Date().toISOString()
            };

            results.push(platformResult);
            
            // Stop if we've reached maxResults
            if (results.length >= maxResults) {
              console.log(`✅ Reached maximum results limit: ${maxResults}`);
              break;
            }
          }
        } else {
          console.warn(`⚠️ No games found on ${page} page or crawl failed`);
        }
        
        // Stop if we've reached maxResults
        if (results.length >= maxResults) break;
        
      } catch (error) {
        console.error(`❌ Error scraping itch.io page ${page}:`, error);
        continue;
      }
    }
    
    console.log(`🎉 Itch.io search completed: ${results.length} total results`);
    return results;
  }

  validateConfig(config: any): boolean {
    return (
      config &&
      Array.isArray(config.itchPages) &&
      config.itchPages.length > 0
    );
  }

  private matchesKeywords(game: ItchioGame, keywords: string[]): boolean {
    if (!keywords || keywords.length === 0) return true;
    
    const searchText = `${game.title} ${game.description} ${game.tags?.join(' ') || ''}`.toLowerCase();
    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
  }

  protected calculateEngagementScore(metadata: any): number {
    const { downloads = '0', rating, price = 'Free', tags_count = 0 } = metadata;
    
    let score = 0;
    
    // Download count scoring
    const downloadNum = parseInt(downloads.replace(/[^\d]/g, '')) || 0;
    if (downloadNum > 10000) score += 4;
    else if (downloadNum > 1000) score += 3;
    else if (downloadNum > 100) score += 2;
    else if (downloadNum > 10) score += 1;
    
    // Rating scoring (if available)
    if (rating) {
      const ratingNum = parseFloat(rating) || 0;
      score += Math.round(ratingNum * 2); // Convert 5-star to 10-point scale
    }
    
    // Price scoring (free games get slight boost for accessibility)
    if (price.toLowerCase().includes('free')) {
      score += 1;
    } else if (price.toLowerCase().includes('name your own price')) {
      score += 0.5;
    }
    
    // Tags scoring (more tags = more discoverable)
    score += Math.min(tags_count * 0.5, 2);
    
    return Math.min(Math.round(score * 10), 100); // Cap at 100
  }

  // NEW: Intelligent two-step search methods
  
  /**
   * Step 1: Fast listing scrape - gets basic game info for decision making
   */
  async scrapeGameListings(strategy: SearchStrategy): Promise<GameListing[]> {
    const { search_params } = strategy;
    const { pages, keywords, maxResults = 50 } = search_params;
    
    const listings: GameListing[] = [];
    
    console.log(`🎮 Starting intelligent itch.io listing scrape across ${pages.length} pages...`);
    
    // Base URLs for different itch.io pages
    const baseUrls = {
      'games': 'https://itch.io/games',
      'new-and-popular': 'https://itch.io/games/new-and-popular',
      'newest': 'https://itch.io/games/newest',
      'top-sellers': 'https://itch.io/games/top-sellers',
      'featured': 'https://itch.io/games/featured'
    };
    
    for (const page of pages) {
      try {
        const url = baseUrls[page as keyof typeof baseUrls];
        if (!url) {
          console.warn(`⚠️ Unknown itch.io page: ${page}`);
          continue;
        }

        console.log(`🎮 Scraping itch.io listings from: ${page} (${url})`);
        
        const listingSchema = {
          type: "object",
          properties: {
            games: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "The game title" },
                  developer: { type: "string", description: "The game developer/creator" },
                  url: { type: "string", description: "Full URL to the game's individual page" },
                  price: { type: "string", description: "Game price (e.g. '$5', 'Free')" },
                  genre: { type: "string", description: "Primary game genre or category" },
                  description: { type: "string", description: "Brief game description or tagline" }
                },
                required: ["title", "developer", "url"]
              },
              maxItems: Math.min(maxResults, 20), // Limit per page
              description: "Array of games from the itch.io listing page"
            }
          },
          required: ["games"]
        };

        const scrapeResult = await rateLimitedFirecrawl.scrapeWithDelay(url, {
          formats: [{
            type: "json",
            prompt: `Extract game listings from this itch.io page. For each game, get the title, developer, full URL to the game page, price, primary genre, and brief description. Focus on the most prominent games displayed.`,
            schema: listingSchema
          }]
        });
        
        if (scrapeResult?.json?.games) {
          const games = scrapeResult.json.games;
          console.log(`📦 Found ${games.length} game listings on ${page} page`);
          
          for (const game of games) {
            // Apply keyword filtering
            const matchesKeywords = this.matchesKeywords(game, keywords);
            if (!matchesKeywords) continue;

            // Ensure URL is absolute
            let gameUrl = game.url;
            if (gameUrl && !gameUrl.startsWith('http')) {
              gameUrl = gameUrl.startsWith('/') ? `https://itch.io${gameUrl}` : `https://itch.io/${gameUrl}`;
            }

            const listing: GameListing = {
              title: game.title || 'Unknown Title',
              developer: game.developer || 'Unknown Developer',
              url: gameUrl || '',
              price: game.price || 'Unknown',
              genre: game.genre || 'Unknown',
              description: game.description || ''
            };

            listings.push(listing);
            
            // Stop if we've reached maxResults
            if (listings.length >= maxResults) {
              console.log(`✅ Reached maximum listings limit: ${maxResults}`);
              break;
            }
          }
        } else {
          console.warn(`⚠️ No game listings found on ${page} page or scrape failed`);
        }
        
        // Stop if we've reached maxResults
        if (listings.length >= maxResults) break;
        
      } catch (error) {
        console.error(`❌ Error scraping itch.io listings from ${page}:`, error);
        continue;
      }
    }
    
    console.log(`🎉 Listing scrape completed: ${listings.length} total game listings`);
    return listings;
  }

  /**
   * Step 2: Detailed scraping with comments - for selected games only
   */
  async scrapeDetailedGames(gameUrls: string[]): Promise<DetailedGame[]> {
    const detailedGames: DetailedGame[] = [];
    
    console.log(`🔍 Starting detailed scraping for ${gameUrls.length} selected games...`);
    
    const gameDetailSchema = {
      type: "object",
      properties: {
        title: { type: "string", description: "The full game title" },
        developer: { type: "string", description: "Developer/creator name" },
        price: { type: "string", description: "Game price" },
        genre: { type: "string", description: "Primary game genre" },
        fullDescription: { type: "string", description: "Complete game description" },
        screenshots: { 
          type: "array", 
          items: { type: "string" },
          description: "Array of screenshot/image URLs" 
        },
        tags: { 
          type: "array", 
          items: { type: "string" },
          description: "Game tags, genres, and categories" 
        },
        platforms: {
          type: "array",
          items: { type: "string" },
          description: "Supported platforms (Windows, Mac, Linux, Web, etc.)"
        },
        rating: { type: "string", description: "Game rating or score if available" },
        fileSize: { type: "string", description: "Download file size if available" },
        releaseDate: { type: "string", description: "Game release date" },
        downloadCount: { type: "string", description: "Number of downloads if visible" },
        hasComments: { type: "boolean", description: "Whether the page has user comments" },
        commentCount: { type: "string", description: "Total number of comments if displayed" },
        comments: {
          type: "array",
          items: {
            type: "object", 
            properties: {
              author: { type: "string", description: "Comment author name" },
              content: { type: "string", description: "Comment text content" },
              date: { type: "string", description: "Comment date (relative, e.g. '2 days ago')" },
              isDevReply: { type: "boolean", description: "True if comment is from the game developer" }
            },
            required: ["author", "content"]
          },
          description: "Array of user comments and reviews (limit to 10-15 most recent)"
        }
      },
      required: ["title", "developer", "fullDescription"]
    };

    for (let i = 0; i < gameUrls.length; i++) {
      const gameUrl = gameUrls[i];
      
      try {
        console.log(`🎮 Processing ${i + 1}/${gameUrls.length}: ${gameUrl}`);

        // Rate limiting - wait 6 seconds between requests
        if (i > 0) {
          console.log('⏳ Rate limiting: waiting 6 seconds...');
          await new Promise(resolve => setTimeout(resolve, 6000));
        }

        const detailResult = await rateLimitedFirecrawl.scrapeWithDelay(gameUrl, {
          formats: [{
            type: "json",
            prompt: "Extract comprehensive game information from this itch.io game page. Include full description, screenshots, tags, rating, supported platforms, file size, and user comments. For comments, include author names, comment text, dates, and identify if comments are from the game developer. Limit to the 10-15 most recent comments.",
            schema: gameDetailSchema
          }]
        });

        if (detailResult?.json) {
          const gameData = detailResult.json;
          
          const detailedGame: DetailedGame = {
            title: gameData.title || 'Unknown Title',
            developer: gameData.developer || 'Unknown Developer',
            url: gameUrl,
            price: gameData.price,
            genre: gameData.genre,
            description: gameData.fullDescription?.substring(0, 200) || '',
            fullDescription: gameData.fullDescription,
            screenshots: gameData.screenshots || [],
            tags: gameData.tags || [],
            platforms: gameData.platforms || [],
            rating: gameData.rating,
            fileSize: gameData.fileSize,
            releaseDate: gameData.releaseDate,
            downloadCount: gameData.downloadCount,
            comments: gameData.comments || [],
            commentCount: parseInt(gameData.commentCount || '0') || gameData.comments?.length || 0,
            hasComments: gameData.hasComments || (gameData.comments && gameData.comments.length > 0)
          };

          detailedGames.push(detailedGame);
          console.log(`✅ Successfully scraped: ${gameData.title} (${gameData.comments?.length || 0} comments)`);
          
        } else {
          console.warn(`⚠️ Failed to get detailed data for: ${gameUrl}`);
        }

      } catch (error) {
        console.error(`❌ Error scraping detailed game ${gameUrl}:`, error.message);
        continue;
      }
    }

    console.log(`🎉 Detailed scraping completed: ${detailedGames.length}/${gameUrls.length} games successfully scraped`);
    return detailedGames;
  }
}

export const itchioSearchTool = createTool({
  id: 'itchio-search',
  description: 'Search itch.io for indie games based on strategy',
  inputSchema: z.object({
    strategy: z.object({
      platform: z.literal('itchio'),
      search_params: z.object({
        pages: z.array(z.string()),
        keywords: z.array(z.string()),
        detailed: z.boolean().default(false),
        maxResults: z.number().default(25),
        qualityThreshold: z.number().default(0.7)
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
    const tool = new ItchioSearchTool();
    const results = await tool.search(context.strategy);
    
    return {
      results,
      total_searched: results.length
    };
  }
});