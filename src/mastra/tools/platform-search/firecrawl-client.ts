import FirecrawlApp from '@mendable/firecrawl-js';
import { Mastra } from '@mastra/core';

let firecrawlClient: FirecrawlApp | null = null;

export function getFirecrawlClient(): FirecrawlApp {
  if (!firecrawlClient) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set');
    }
    firecrawlClient = new FirecrawlApp({ apiKey });
  }
  return firecrawlClient;
}

export class RateLimitedFirecrawl {
  private lastRequestTime = 0;
  private readonly delayMs = 6000; // 6 seconds between requests (10 requests/minute)
  private firecrawl: FirecrawlApp;

  constructor() {
    this.firecrawl = getFirecrawlClient();
  }

  async scrapeWithDelay(url: string, mastra?: Mastra, options?: any): Promise<any> {
    const logger = mastra?.getLogger();
    
    // Enforce rate limit
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      logger?.info('Rate limiting: waiting before next request', {
        waitTimeMs: waitTime
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    
    try {
      logger?.info('Scraping URL', { url });
      // Use the correct v3 API method: scrape instead of scrapeUrl
      const result = await this.firecrawl.scrape(url, options);
      logger?.info('Successfully scraped URL', { url });
      return result;
    } catch (error: any) {
      logger?.error('Failed to scrape URL', {
        url,
        error: error.message
      });
      
      // Handle specific Firecrawl errors
      if (error.message?.includes('rate limit')) {
        logger?.warn('Rate limit hit, waiting 60 seconds', { url });
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new Error('Rate limit exceeded - please retry');
      }
      
      if (error.message?.includes('invalid API key')) {
        throw new Error('Invalid Firecrawl API key - check FIRECRAWL_API_KEY environment variable');
      }
      
      throw error;
    }
  }

  async crawlWithDelay(url: string, mastra?: Mastra, options?: any): Promise<any> {
    const logger = mastra?.getLogger();
    
    // Enforce rate limit
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      logger?.info('Rate limiting: waiting before next request', {
        waitTimeMs: waitTime
      });
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    
    try {
      logger?.info('Crawling URL', { url });
      const result = await this.firecrawl.crawl(url, options);
      logger?.info('Successfully crawled URL', { url });
      return result;
    } catch (error: any) {
      logger?.error('Failed to crawl URL', {
        url,
        error: error.message
      });
      
      // Handle specific Firecrawl errors
      if (error.message?.includes('rate limit')) {
        logger?.warn('Rate limit hit, waiting 60 seconds', { url });
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new Error('Rate limit exceeded - please retry');
      }
      
      if (error.message?.includes('invalid API key')) {
        throw new Error('Invalid Firecrawl API key - check FIRECRAWL_API_KEY environment variable');
      }
      
      throw error;
    }
  }

  async batchScrape(urls: string[], mastra?: Mastra, options?: any, batchSize: number = 3): Promise<any[]> {
    const logger = mastra?.getLogger();
    const results: any[] = [];
    
    logger?.info('Starting batch scrape', {
      totalUrls: urls.length,
      batchSize
    });
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      logger?.info('Processing batch', {
        batchNumber: Math.floor(i / batchSize) + 1,
        totalBatches: Math.ceil(urls.length / batchSize)
      });
      
      const batchPromises = batch.map(async (url) => {
        try {
          return await this.scrapeWithDelay(url, mastra, options);
        } catch (error) {
          logger?.warn('Skipping failed URL', { url });
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));
      
      // Extra delay between batches
      if (i + batchSize < urls.length) {
        logger?.info('Waiting between batches');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    logger?.info('Batch scrape completed', {
      successful: results.length,
      total: urls.length
    });
    return results;
  }
}

export const rateLimitedFirecrawl = new RateLimitedFirecrawl();