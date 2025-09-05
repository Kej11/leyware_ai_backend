export interface Scout {
  id: string;
  name: string;
  instructions: string;
  keywords: string[];
  platform: 'reddit' | 'steam' | 'itchio';
  platform_config: Record<string, any>;
  organization_id: string;
  max_results: number;
  quality_threshold: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  last_run_at?: Date;
  next_run_at?: Date;
  total_runs: number;
  is_running: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ScoutRun {
  id: string;
  scout_id: string;
  organization_id: string;
  status: 'initializing' | 'searching' | 'analyzing' | 'storing' | 'completed' | 'failed';
  current_step?: string;
  step_data?: Record<string, any>;
  run_config?: Record<string, any>;
  total_to_search: number;
  total_searched: number;
  total_analyzed: number;
  total_stored: number;
  started_at: Date;
  search_completed_at?: Date;
  analysis_completed_at?: Date;
  completed_at?: Date;
  results_found: number;
  results_processed: number;
  high_relevance_count: number;
  error_message?: string;
  error_step?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ScoutResult {
  id: string;
  scout_id: string;
  run_id?: string;
  organization_id: string;
  platform: string;
  external_id?: string;
  url: string;
  title: string;
  description?: string;
  content?: string;
  author?: string;
  author_url?: string;
  engagement_score: number;
  relevance_score?: number;
  platform_data?: Record<string, any>;
  status: string;
  found_at?: Date;
  created_at: Date;
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