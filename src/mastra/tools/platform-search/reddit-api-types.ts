export interface RedditAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  obtained_at: number;
}

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  permalink: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  upvote_ratio: number;
  total_awards_received?: number;
  is_video: boolean;
  over_18: boolean;
  is_self: boolean;
  thumbnail?: string;
  post_hint?: string;
}

export interface RedditListing {
  kind: string;
  data: {
    children: Array<{
      kind: string;
      data: RedditPost;
    }>;
    after: string | null;
    before: string | null;
    dist: number;
    modhash: string;
  };
}

export interface RedditSearchParams {
  q: string;
  sort: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
  t: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  limit: number;
  restrict_sr: boolean;
  after?: string;
}

export interface RedditApiError {
  error: string;
  message?: string;
  error_type?: string;
}