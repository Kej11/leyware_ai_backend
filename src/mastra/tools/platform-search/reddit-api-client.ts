import { RedditAuthToken, RedditListing, RedditSearchParams, RedditApiError } from './reddit-api-types';

export class RedditApiClient {
  private clientId: string;
  private clientSecret: string;
  private userAgent: string;
  private token: RedditAuthToken | null = null;
  private baseUrl = 'https://oauth.reddit.com';
  private authUrl = 'https://www.reddit.com/api/v1/access_token';

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.REDDIT_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.REDDIT_CLIENT_SECRET || '';
    this.userAgent = 'MastraBot/1.0 by ScoutSearch';

    if (!this.clientId || !this.clientSecret) {
      throw new Error('Reddit API credentials not provided. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables.');
    }
  }

  private async authenticate(): Promise<void> {
    if (this.token && this.isTokenValid()) {
      return;
    }

    console.log('🔐 Authenticating with Reddit API...');

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(this.authUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Reddit authentication failed: ${response.status} - ${error}`);
    }

    const tokenData = await response.json();
    
    this.token = {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      obtained_at: Date.now()
    };

    console.log(`✅ Reddit API authenticated. Token expires in ${this.token.expires_in} seconds`);
  }

  private isTokenValid(): boolean {
    if (!this.token) return false;
    
    const now = Date.now();
    const expiresAt = this.token.obtained_at + (this.token.expires_in * 1000);
    const bufferTime = 60 * 1000; // 1 minute buffer
    
    return now < (expiresAt - bufferTime);
  }

  private async makeAuthenticatedRequest(endpoint: string, params?: Record<string, string>): Promise<any> {
    await this.authenticate();

    if (!this.token) {
      throw new Error('Failed to obtain Reddit API token');
    }

    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.token.access_token}`,
        'User-Agent': this.userAgent
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: RedditApiError;
      
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: `HTTP ${response.status}`, message: errorText };
      }

      throw new Error(`Reddit API error: ${errorData.error} - ${errorData.message || 'Unknown error'}`);
    }

    return response.json();
  }

  async searchSubreddit(subreddit: string, searchParams: RedditSearchParams): Promise<RedditListing> {
    const params: Record<string, string> = {
      q: searchParams.q,
      sort: searchParams.sort,
      t: searchParams.t,
      limit: searchParams.limit.toString(),
      restrict_sr: searchParams.restrict_sr.toString()
    };

    if (searchParams.after) {
      params.after = searchParams.after;
    }

    return this.makeAuthenticatedRequest(`/r/${subreddit}/search`, params);
  }

  async getSubredditPosts(subreddit: string, sort: 'hot' | 'new' | 'top' | 'rising' = 'hot', params?: {
    limit?: number;
    t?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
    after?: string;
  }): Promise<RedditListing> {
    const searchParams: Record<string, string> = {
      limit: (params?.limit || 25).toString()
    };

    if (params?.t && sort === 'top') {
      searchParams.t = params.t;
    }

    if (params?.after) {
      searchParams.after = params.after;
    }

    return this.makeAuthenticatedRequest(`/r/${subreddit}/${sort}`, searchParams);
  }

  async getRateLimitStatus(): Promise<{ remaining: number; reset: number; used: number }> {
    // Reddit doesn't provide rate limit headers in OAuth responses
    // This is a placeholder for potential future implementation
    return { remaining: 600, reset: Date.now() + 600000, used: 0 };
  }
}

// Singleton instance for reuse
let redditClient: RedditApiClient | null = null;

export function getRedditClient(): RedditApiClient {
  if (!redditClient) {
    redditClient = new RedditApiClient();
  }
  return redditClient;
}