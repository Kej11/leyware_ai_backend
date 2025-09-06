export interface Scout {
  id: string;
  organizationId: string;
  createdBy?: string;
  name: string;
  platform: string;
  instructions: string;
  frequency: string;
  keywords?: any[];
  priority: string;
  status: string;
  isRunning?: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  totalRuns?: number;
  settings?: any;
  maxResults: number;
  qualityThreshold: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoutRun {
  id: string;
  scoutId: string;
  organizationId: string;
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  resultsFound?: number;
  resultsProcessed?: number;
  errorsCount?: number;
  runConfig?: any;
  errorMessage?: string;
  errorDetails?: any;
  createdAt: Date;
}

export interface ScoutResult {
  id: string;
  scoutId: string;
  organizationId: string;
  platform: string;
  externalId?: string;
  url?: string;
  title?: string;
  description?: string;
  content?: string;
  author?: string;
  authorUrl?: string;
  engagementScore?: number;
  relevanceScore?: number;
  sentimentScore?: number;
  platformData?: any;
  status: string;
  processedAt?: Date;
  aiSummary?: string;
  aiTags?: any;
  aiConfidenceScore?: number;
  foundAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoutRunEvent {
  id: string;
  run_id: string;
  event_type: 'step_started' | 'step_completed' | 'error' | 'warning';
  step_name?: string;
  event_data?: Record<string, any>;
  created_at: Date;
}

export interface PlatformSearchResult {
  platform: string;
  source_url: string;
  title: string;
  content: string;
  author: string;
  author_url?: string;
  engagement_score: number;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SearchStrategy {
  platform: string;
  search_params: Record<string, any>;
  expanded_keywords: string[];
  reasoning: string;
}

// Decision and comment data stored in platformData and runConfig

export interface GameListing {
  title: string;
  developer: string;
  url: string;
  price?: string;
  genre?: string;
  description?: string;
}

export interface DetailedGame {
  title: string;
  developer: string;
  url: string;
  price?: string;
  genre?: string;
  description?: string;
  fullDescription?: string;
  screenshots?: string[];
  tags?: string[];
  platforms?: string[];
  rating?: string;
  fileSize?: string;
  releaseDate?: string;
  downloadCount?: string;
  comments?: Array<{
    author: string;
    content: string;
    date?: string;
    isDevReply?: boolean;
  }>;
  commentCount?: number;
  hasComments?: boolean;
}

export interface InvestigationDecision {
  gameUrl: string;
  gameTitle: string;
  shouldInvestigate: boolean;
  score: number;
  reasoning: string;
}

export interface StorageDecision {
  gameUrl: string;
  gameTitle: string;
  shouldStore: boolean;
  score: number;
  reasoning: string;
  sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
}