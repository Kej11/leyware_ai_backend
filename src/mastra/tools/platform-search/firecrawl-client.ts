import FirecrawlApp from '@mendable/firecrawl-js';

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

  async scrapeWithDelay(url: string, options: any): Promise<any> {
    // Enforce rate limit
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    
    try {
      console.log(`🔍 Scraping URL: ${url}`);
      // Use the correct v3 API method: scrape instead of scrapeUrl
      const result = await this.firecrawl.scrape(url, options);
      console.log(`✅ Successfully scraped: ${url}`);
      return result;
    } catch (error: any) {
      console.error(`❌ Failed to scrape ${url}:`, error.message);
      
      // Handle specific Firecrawl errors
      if (error.message?.includes('rate limit')) {
        console.log('⏳ Rate limit hit, waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new Error('Rate limit exceeded - please retry');
      }
      
      if (error.message?.includes('invalid API key')) {
        throw new Error('Invalid Firecrawl API key - check FIRECRAWL_API_KEY environment variable');
      }
      
      throw error;
    }
  }

  async crawlWithDelay(url: string, options: any): Promise<any> {
    // Enforce rate limit
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
    
    try {
      console.log(`🕷️ Crawling URL: ${url}`);
      const result = await this.firecrawl.crawl(url, options);
      console.log(`✅ Successfully crawled: ${url}`);
      return result;
    } catch (error: any) {
      console.error(`❌ Failed to crawl ${url}:`, error.message);
      
      // Handle specific Firecrawl errors
      if (error.message?.includes('rate limit')) {
        console.log('⏳ Rate limit hit, waiting 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new Error('Rate limit exceeded - please retry');
      }
      
      if (error.message?.includes('invalid API key')) {
        throw new Error('Invalid Firecrawl API key - check FIRECRAWL_API_KEY environment variable');
      }
      
      throw error;
    }
  }

  async batchScrape(urls: string[], options: any, batchSize: number = 3): Promise<any[]> {
    const results: any[] = [];
    
    console.log(`🚀 Starting batch scrape of ${urls.length} URLs (batch size: ${batchSize})`);
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(urls.length / batchSize)}`);
      
      const batchPromises = batch.map(async (url) => {
        try {
          return await this.scrapeWithDelay(url, options);
        } catch (error) {
          console.warn(`⚠️ Skipping failed URL: ${url}`);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));
      
      // Extra delay between batches
      if (i + batchSize < urls.length) {
        console.log('⏳ Waiting between batches...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`🎉 Batch scrape completed: ${results.length}/${urls.length} successful`);
    return results;
  }
}

export const rateLimitedFirecrawl = new RateLimitedFirecrawl();