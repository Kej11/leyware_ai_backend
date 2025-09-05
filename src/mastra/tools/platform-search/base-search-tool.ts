import { PlatformSearchResult, SearchStrategy } from '../../database/schemas';

export abstract class BasePlatformSearchTool {
  abstract platform: string;
  
  abstract search(strategy: SearchStrategy): Promise<PlatformSearchResult[]>;
  
  abstract validateConfig(config: any): boolean;
  
  protected normalizeContent(content: string): string {
    return content
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, 5000);
  }
  
  protected calculateEngagementScore(metadata: any): number {
    return 0;
  }
}