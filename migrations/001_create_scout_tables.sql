-- Scout Search Database Schema
-- Platform: Neon PostgreSQL
-- Created: 2025

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Scouts configuration table
CREATE TABLE IF NOT EXISTS scouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('reddit', 'steam', 'itchio')),
  platform_config JSONB NOT NULL DEFAULT '{}',
  organization_id UUID NOT NULL,
  max_results INTEGER DEFAULT 50 CHECK (max_results > 0 AND max_results <= 500),
  quality_threshold DECIMAL DEFAULT 0.7 CHECK (quality_threshold >= 0 AND quality_threshold <= 1),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  total_runs INTEGER DEFAULT 0,
  is_running BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scout runs tracking
CREATE TABLE IF NOT EXISTS scout_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('initializing', 'searching', 'analyzing', 'storing', 'completed', 'failed')),
  current_step TEXT,
  step_data JSONB,
  run_config JSONB,
  
  -- Progress tracking
  total_to_search INTEGER DEFAULT 0,
  total_searched INTEGER DEFAULT 0,
  total_analyzed INTEGER DEFAULT 0,
  total_stored INTEGER DEFAULT 0,
  
  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  search_completed_at TIMESTAMPTZ,
  analysis_completed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Results summary
  results_found INTEGER DEFAULT 0,
  results_processed INTEGER DEFAULT 0,
  high_relevance_count INTEGER DEFAULT 0,
  
  error_message TEXT,
  error_step TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scout results storage
CREATE TABLE IF NOT EXISTS scout_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id UUID NOT NULL REFERENCES scouts(id) ON DELETE CASCADE,
  run_id UUID REFERENCES scout_runs(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  author TEXT,
  author_url TEXT,
  engagement_score INTEGER DEFAULT 0,
  relevance_score DECIMAL CHECK (relevance_score >= 0 AND relevance_score <= 1),
  platform_data JSONB,
  status TEXT DEFAULT 'pending',
  found_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(scout_id, external_id)
);

-- Scout run events for detailed tracking
CREATE TABLE IF NOT EXISTS scout_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES scout_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('step_started', 'step_completed', 'error', 'warning')),
  step_name TEXT,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scouts_org ON scouts(organization_id);
CREATE INDEX IF NOT EXISTS idx_scouts_platform ON scouts(platform);
CREATE INDEX IF NOT EXISTS idx_scouts_next_run ON scouts(next_run_at) WHERE is_running = FALSE;

CREATE INDEX IF NOT EXISTS idx_scout_runs_scout ON scout_runs(scout_id);
CREATE INDEX IF NOT EXISTS idx_scout_runs_status ON scout_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scout_results_scout ON scout_results(scout_id);
CREATE INDEX IF NOT EXISTS idx_scout_results_run ON scout_results(run_id);
CREATE INDEX IF NOT EXISTS idx_scout_results_relevance ON scout_results(scout_id, relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_scout_run_events_run ON scout_run_events(run_id, created_at DESC);

-- Update trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update trigger to tables with updated_at column
CREATE TRIGGER update_scouts_updated_at BEFORE UPDATE ON scouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scout_runs_updated_at BEFORE UPDATE ON scout_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scout_results_updated_at BEFORE UPDATE ON scout_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();