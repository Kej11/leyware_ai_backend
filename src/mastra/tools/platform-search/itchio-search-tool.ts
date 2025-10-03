import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { BasePlatformSearchTool } from './base-search-tool';
import { PlatformSearchResult, SearchStrategy, GameListing, DetailedGame } from '../../database/schemas';
import { rateLimitedFirecrawl } from './firecrawl-client';
import {
  ItchioSearchParams,
  ItchioGame,
  itchioGamesListSchema,
  ItchioSearchStrategy,
  GENRE_URL_MAP,
  ItchioGenre
} from './itchio-types';
import { decideInvestigation } from '../../agents/investigation-decision-agent';
import { decideStorage } from '../../agents/storage-decision-agent';
import { selectGenres } from '../../agents/genre-selection-agent';
import { Mastra } from '@mastra/core';

export class ItchioSearchTool extends BasePlatformSearchTool {
  platform = 'itchio';

  async search(strategy: SearchStrategy, mastra?: Mastra): Promise<PlatformSearchResult[]> {
    const logger = mastra?.getLogger();
    
    logger?.info('Starting intelligent itch.io search', {
      platform: this.platform,
      strategy: strategy
    });
    
    const { search_params } = strategy;
    
    if (!search_params) {
      throw new Error('Itch.io search: Missing search_params in strategy');
    }
    
    // Extract scout instructions and keywords from strategy if available
    const scoutInstructions = (strategy as any).instructions || 'Find indie games seeking publishing opportunities';
    const scoutKeywords = (strategy as any).expanded_keywords || search_params.keywords || [];
    
    logger?.info('Starting two-step scraping process', {
      platform: this.platform,
      scoutInstructions,
      keywords: scoutKeywords,
      pages: search_params.pages
    });
    
    try {
      // STEP 1: Scrape game listings (fast, broad)
      logger?.info('Step 1: Scraping game listings', { platform: this.platform });
      const listings = await this.scrapeGameListings(strategy, mastra);
      
      if (listings.length === 0) {
        logger?.warn('No game listings found', { platform: this.platform });
        return [];
      }
      
      logger?.info('Game listings found', { 
        platform: this.platform,
        count: listings.length 
      });
      
      // STEP 2: AI decides which games to investigate (limit to 30-40% or max 10)
      logger?.info('Step 2: Making investigation decisions', { platform: this.platform });
      const maxInvestigations = Math.min(Math.ceil(listings.length * 0.4), 10);
      
      let investigationDecisions;
      if (mastra) {
        investigationDecisions = await decideInvestigation(
          mastra,
          scoutInstructions,
          scoutKeywords,
          listings,
          maxInvestigations
        );
      } else {
        // Fallback: select games with meaningful descriptions
        investigationDecisions = listings.map(game => ({
          gameUrl: game.url,
          gameTitle: game.title,
          shouldInvestigate: (game.description && game.description.length > 20) || false,
          score: 0.6,
          reasoning: 'Fallback selection - no Mastra instance available'
        })).sort((a, b) => b.score - a.score).slice(0, maxInvestigations);
      }
      
      const gamesToInvestigate = investigationDecisions
        .filter(d => d.shouldInvestigate)
        .map(d => d.gameUrl)
        .filter(url => url && url.length > 0);
      
      logger?.info('Investigation decisions completed', {
        platform: this.platform,
        selected: gamesToInvestigate.length,
        total: listings.length
      });
      
      if (gamesToInvestigate.length === 0) {
        logger?.warn('No games selected for investigation', { platform: this.platform });
        return [];
      }
      
      // STEP 3: Scrape detailed game data (slow, targeted)
      logger?.info('Step 3: Scraping detailed game data', { platform: this.platform });
      const detailedGames = await this.scrapeDetailedGames(gamesToInvestigate, mastra);
      
      if (detailedGames.length === 0) {
        logger?.warn('No detailed games scraped successfully', { platform: this.platform });
        return [];
      }
      
      logger?.info('Detailed scraping completed', { 
        platform: this.platform,
        gamesScraped: detailedGames.length 
      });
      
      // STEP 4: AI makes final storage decisions (with quality threshold 0.4)
      logger?.info('Step 4: Making storage decisions', { platform: this.platform });
      const qualityThreshold = 0.4; // Hard-coded for inclusivity
      
      let storageDecisions;
      if (mastra) {
        storageDecisions = await decideStorage(
          mastra,
          scoutInstructions,
          scoutKeywords,
          detailedGames,
          qualityThreshold
        );
      } else {
        // Fallback: approve all detailed games
        storageDecisions = detailedGames.map(game => ({
          gameUrl: game.url,
          gameTitle: game.title,
          shouldStore: true,
          score: 0.6,
          reasoning: 'Fallback approval - no Mastra instance available',
          sentiment: 'positive'
        }));
      }
      
      const gamesToStore = detailedGames.filter(game => {
        const decision = storageDecisions.find(d => d.gameUrl === game.url || d.gameTitle === game.title);
        return decision?.shouldStore;
      });
      
      logger?.info('Storage decisions completed', {
        platform: this.platform,
        approved: gamesToStore.length,
        total: detailedGames.length
      });
      
      // STEP 5: Convert to PlatformSearchResult format
      logger?.info('Step 5: Converting to platform results', { platform: this.platform });
      const platformResults = this.convertDetailedGamesToPlatformResults(gamesToStore, storageDecisions);
      
      logger?.info('Intelligent search completed', {
        platform: this.platform,
        totalListings: listings.length,
        investigated: detailedGames.length,
        finalResults: platformResults.length
      });
      
      return platformResults;
      
    } catch (error) {
      logger?.error('Error in intelligent search', {
        platform: this.platform,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fallback to basic search if intelligent search fails
      logger?.info('Falling back to basic listing scrape', { platform: this.platform });
      return this.basicSearch(strategy, mastra);
    }
  }

  validateConfig(config: any): boolean {
    return (
      config &&
      Array.isArray(config.itchPages) &&
      config.itchPages.length > 0
    );
  }

  private matchesKeywords(game: ItchioGame, keywords: string[]): boolean {
    // If no keywords specified, include all games
    if (!keywords || keywords.length === 0) return true;
    
    // For indie game discovery, be more inclusive
    // Don't require keyword match - this is handled by the AI agents later
    // Just log if there's a match for debugging
    const searchText = `${game.title} ${game.description} ${game.tags?.join(' ') || ''}`.toLowerCase();
    const hasMatch = keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    
    // Keyword matching is logged at a debug level - removed for cleaner logs
    
    // Return true for all games - let the AI agents decide relevance
    return true;
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
  async scrapeGameListings(strategy: SearchStrategy, mastra?: Mastra): Promise<GameListing[]> {
    const logger = mastra?.getLogger();
    const { search_params } = strategy;
    const { pages, keywords, maxResults = 50 } = search_params;

    // Extract scout instructions for genre selection
    const scoutInstructions = (strategy as any).instructions || '';
    const scoutKeywords = (strategy as any).expanded_keywords || keywords || [];

    const listings: GameListing[] = [];

    logger?.info('Starting listing scrape', {
      platform: this.platform,
      pagesCount: pages.length,
      keywords: keywords,
      maxResults: maxResults,
      hasInstructions: !!scoutInstructions
    });

    // GENRE SELECTION: Try to identify specific genres from scout mission
    let selectedGenres: ItchioGenre[] = [];
    if (mastra && scoutInstructions) {
      try {
        logger?.info('Attempting genre selection from scout instructions', {
          platform: this.platform,
          instructionsPreview: scoutInstructions.substring(0, 100)
        });

        const genreSelections = await selectGenres(mastra, scoutInstructions, scoutKeywords);
        selectedGenres = genreSelections.map(s => s.genre);

        if (selectedGenres.length > 0) {
          logger?.info('Genre selection successful', {
            platform: this.platform,
            selectedGenres,
            confidences: genreSelections.map(s => s.confidence),
            reasoning: genreSelections.map(s => s.reasoning)
          });
        } else {
          logger?.info('No specific genres identified - using default pages', {
            platform: this.platform
          });
        }
      } catch (error) {
        logger?.warn('Genre selection failed, falling back to default pages', {
          platform: this.platform,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Build URLs to scrape: genre URLs if selected, otherwise default pages
    const urlsToScrape: Array<{ url: string; source: string }> = [];

    if (selectedGenres.length > 0) {
      // Use genre-specific URLs
      for (const genre of selectedGenres) {
        urlsToScrape.push({
          url: GENRE_URL_MAP[genre],
          source: `genre-${genre}`
        });
      }

      // Also add one default page for broader coverage
      urlsToScrape.push({
        url: 'https://itch.io/games/new-and-popular',
        source: 'new-and-popular'
      });
    } else {
      // Use default page-based URLs
      const baseUrls = {
        'games': 'https://itch.io/games',
        'new-and-popular': 'https://itch.io/games/new-and-popular',
        'newest': 'https://itch.io/games/newest',
        'top-sellers': 'https://itch.io/games/top-sellers',
        'featured': 'https://itch.io/games/featured'
      };

      for (const page of pages) {
        const url = baseUrls[page as keyof typeof baseUrls];
        if (url) {
          urlsToScrape.push({ url, source: page });
        }
      }
    }

    logger?.info('URLs to scrape determined', {
      platform: this.platform,
      urlCount: urlsToScrape.length,
      sources: urlsToScrape.map(u => u.source)
    });

    for (const { url, source } of urlsToScrape) {
      try {
        logger?.info('Scraping listings from URL', {
          platform: this.platform,
          source,
          url
        });
        
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

        const scrapeResult = await rateLimitedFirecrawl.scrapeWithDelay(url, mastra, {
          formats: [{
            type: "json",
            prompt: `Extract game listings from this itch.io page. For each game, get the title, developer, full URL to the game page, price, primary genre, and brief description. Focus on the most prominent games displayed.`,
            schema: listingSchema
          }]
        });
        
        if (scrapeResult?.json?.games) {
          const games = scrapeResult.json.games;
          logger?.info('Found game listings from source', {
            platform: this.platform,
            source,
            listingsCount: games.length
          });
          
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
              logger?.info('Reached maximum listings limit', { 
                platform: this.platform,
                maxResults: maxResults 
              });
              break;
            }
          }
        } else {
          logger?.warn('No game listings found from source or scrape failed', {
            platform: this.platform,
            source
          });
        }

        // Stop if we've reached maxResults
        if (listings.length >= maxResults) break;

      } catch (error) {
        logger?.error('Error scraping listings from source', {
          platform: this.platform,
          source,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }
    
    logger?.info('Listing scrape completed', { 
      platform: this.platform,
      totalListings: listings.length 
    });
    return listings;
  }

  /**
   * Step 2: Detailed scraping with comments - for selected games only
   */
  async scrapeDetailedGames(gameUrls: string[], mastra?: Mastra): Promise<DetailedGame[]> {
    const logger = mastra?.getLogger();
    const detailedGames: DetailedGame[] = [];
    
    logger?.info('Starting detailed scraping for selected games', { 
      platform: this.platform,
      gamesCount: gameUrls.length 
    });
    
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
        logger?.info('Processing game for detailed scraping', { 
          platform: this.platform,
          index: i + 1,
          total: gameUrls.length,
          gameUrl: gameUrl
        });

        // Rate limiting - wait 6 seconds between requests
        if (i > 0) {
          logger?.info('Rate limiting: waiting 6 seconds', { platform: this.platform });
          await new Promise(resolve => setTimeout(resolve, 6000));
        }

        const detailResult = await rateLimitedFirecrawl.scrapeWithDelay(gameUrl, mastra, {
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
          logger?.info('Successfully scraped detailed game', { 
            platform: this.platform,
            gameTitle: gameData.title,
            commentsCount: gameData.comments?.length || 0
          });
          
        } else {
          logger?.warn('Failed to get detailed data for game', { 
            platform: this.platform,
            gameUrl: gameUrl 
          });
        }

      } catch (error) {
        logger?.error('Error scraping detailed game', { 
          platform: this.platform,
          gameUrl: gameUrl,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }

    logger?.info('Detailed scraping completed', { 
      platform: this.platform,
      successful: detailedGames.length,
      total: gameUrls.length,
      successRate: `${((detailedGames.length / gameUrls.length) * 100).toFixed(1)}%`
    });
    return detailedGames;
  }

  /**
   * Convert DetailedGame objects to PlatformSearchResult format
   */
  private convertDetailedGamesToPlatformResults(
    detailedGames: DetailedGame[],
    storageDecisions: any[]
  ): PlatformSearchResult[] {
    return detailedGames.map(game => {
      const decision = storageDecisions.find(d => d.gameUrl === game.url || d.gameTitle === game.title);
      
      return {
        platform: 'itchio',
        source_url: game.url,
        title: game.title,
        content: this.normalizeContent(game.fullDescription || game.description),
        author: game.developer,
        author_url: `https://itch.io/profile/${game.developer.toLowerCase().replace(/\s+/g, '-')}`,
        engagement_score: this.calculateEngagementScoreFromDetailedGame(game),
        metadata: {
          price: game.price,
          genre: game.genre,
          tags: game.tags || [],
          platforms: game.platforms || [],
          screenshots: game.screenshots || [],
          downloads: game.downloadCount,
          rating: game.rating,
          release_date: game.releaseDate,
          file_size: game.fileSize,
          comments: game.comments || [],
          comment_count: game.commentCount || 0,
          has_comments: game.hasComments || false,
          full_description: game.fullDescription,
          // AI decision data
          storage_score: decision?.score || 0,
          storage_reasoning: decision?.reasoning || '',
          sentiment: decision?.sentiment || 'neutral'
        },
        created_at: new Date().toISOString()
      };
    });
  }

  /**
   * Calculate engagement score from detailed game data
   */
  private calculateEngagementScoreFromDetailedGame(game: DetailedGame): number {
    let score = 0;
    
    // Download count scoring
    const downloadNum = parseInt((game.downloadCount || '0').replace(/[^\d]/g, '')) || 0;
    if (downloadNum > 10000) score += 40;
    else if (downloadNum > 1000) score += 30;
    else if (downloadNum > 100) score += 20;
    else if (downloadNum > 10) score += 10;
    
    // Rating scoring (if available)
    if (game.rating) {
      const ratingNum = parseFloat(game.rating) || 0;
      score += Math.round(ratingNum * 10); // Convert 5-star to 50-point scale
    }
    
    // Comment engagement scoring
    const commentCount = game.commentCount || 0;
    if (commentCount > 50) score += 20;
    else if (commentCount > 20) score += 15;
    else if (commentCount > 10) score += 10;
    else if (commentCount > 5) score += 5;
    
    // Content quality scoring
    if (game.fullDescription && game.fullDescription.length > 500) score += 10;
    if (game.screenshots && game.screenshots.length > 3) score += 5;
    if (game.tags && game.tags.length > 5) score += 5;
    
    return Math.min(score, 100); // Cap at 100
  }

  /**
   * Fallback basic search method (old behavior)
   */
  private async basicSearch(strategy: SearchStrategy, mastra?: Mastra): Promise<PlatformSearchResult[]> {
    const logger = mastra?.getLogger();
    const { search_params } = strategy;
    const pages = search_params.pages || ['games', 'new-and-popular', 'newest'];
    const keywords = search_params.keywords || [];
    const maxResults = search_params.maxResults || 25;
    
    const results: PlatformSearchResult[] = [];
    
    logger?.info('Starting basic search (fallback mode)', { 
      platform: this.platform,
      pagesCount: pages.length,
      keywords: keywords,
      maxResults: maxResults
    });
    
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
          logger?.warn('Unknown page', { 
            platform: this.platform,
            page: page 
          });
          continue;
        }

        logger?.info('Scraping page', { 
          platform: this.platform,
          page: page, 
          url: url 
        });
        
        const scrapeResult = await rateLimitedFirecrawl.scrapeWithDelay(url, mastra, {
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
        
        if (scrapeResult?.json?.games) {
          const games = scrapeResult.json.games;
          logger?.info('Found games on page', { 
            platform: this.platform,
            page: page,
            gamesCount: games.length
          });
          
          for (const game of games) {
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
            
            if (results.length >= maxResults) {
              logger?.info('Reached maximum results limit', { 
                platform: this.platform,
                maxResults: maxResults 
              });
              break;
            }
          }
        } else {
          logger?.warn('No games found on page or crawl failed', { 
            platform: this.platform,
            page: page 
          });
        }
        
        if (results.length >= maxResults) break;
        
      } catch (error) {
        logger?.error('Error scraping page', { 
          platform: this.platform,
          page: page,
          error: error instanceof Error ? error.message : String(error)
        });
        continue;
      }
    }
    
    logger?.info('Basic search completed', { 
      platform: this.platform,
      totalResults: results.length 
    });
    return results;
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
  execute: async ({ context, mastra }) => {
    const tool = new ItchioSearchTool();
    const results = await tool.search(context.strategy, mastra);
    
    return {
      results,
      total_searched: results.length
    };
  }
});
