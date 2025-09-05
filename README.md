# Scout Search Workflow

An intelligent content discovery system built with Mastra that searches and analyzes gaming-related content across multiple platforms using AI agents.

## Features

- **Multi-Platform Support**: Designed for Reddit, Steam, and itch.io (Reddit implemented)
- **AI-Powered Search**: Uses Google Gemini for intelligent search strategy generation
- **Content Analysis**: AI-driven relevance scoring for quality filtering
- **Async Database-First**: All operations tracked in database for async client access
- **Batch Processing**: Efficient handling of large result sets
- **Comprehensive Tracking**: Detailed run history and event logging

## Architecture

```
src/mastra/
├── agents/                    # AI agents for strategy and analysis
│   ├── search-planning-agent.ts
│   ├── content-analysis-agent.ts
│   └── scout-workflow-agent.ts
├── tools/                     # Platform search and database tools
│   ├── platform-search/
│   │   ├── base-search-tool.ts
│   │   └── reddit-search-tool.ts
│   └── database-tools.ts
├── workflows/                 # Main workflow orchestration
│   └── scout-search-workflow.ts
├── database/                  # Neon PostgreSQL integration
│   ├── neon-client.ts
│   └── schemas.ts
└── index.ts                   # Mastra configuration & API routes
```

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and add your credentials:

```bash
cp .env.example .env
```

Required environment variables:
- `NEON_DATABASE_URL`: Your Neon PostgreSQL connection string
- `GOOGLE_GENERATIVE_AI_API_KEY`: Google AI Studio API key

### 3. Initialize Database

Run the migration script on your Neon database:

```bash
# Connect to your Neon database and run:
psql $NEON_DATABASE_URL < migrations/001_create_scout_tables.sql
```

### 4. Create a Test Scout

```sql
INSERT INTO scouts (
  name, 
  instructions, 
  keywords, 
  platform, 
  platform_config,
  organization_id,
  max_results,
  quality_threshold,
  frequency
) VALUES (
  'Indie Game Scout',
  'Find discussions about new indie games, development updates, and community feedback',
  ARRAY['indie games', 'gamedev', 'steam'],
  'reddit',
  '{"target_subreddits": ["indiegaming", "gamedev", "steam"]}',
  gen_random_uuid(),
  50,
  0.7,
  'daily'
);
```

## Usage

### Start the Mastra Dev Server

```bash
pnpm dev
```

The server will start at `http://localhost:4111`

### API Endpoints

#### Trigger Scout Run (Async)

```bash
POST /scouts/:scoutId/run
```

Starts a scout run asynchronously and returns immediately with a run ID:

```bash
curl -X POST http://localhost:4111/api/scouts/{scout-id}/run
```

Response:
```json
{
  "run_id": "abc123...",
  "status": "started",
  "message": "Scout run initiated successfully"
}
```

#### Check Run Status

```bash
GET /scouts/:scoutId/runs/:runId
```

Poll this endpoint to check the progress of a scout run:

```bash
curl http://localhost:4111/api/scouts/{scout-id}/runs/{run-id}
```

Response:
```json
{
  "id": "abc123...",
  "status": "analyzing",
  "current_step": "analyze_content",
  "total_searched": 150,
  "total_analyzed": 75,
  "total_stored": 0,
  "results_found": 150,
  "high_relevance_count": 12
}
```

#### Get Run Events

```bash
GET /scouts/:scoutId/runs/:runId/events
```

Get detailed event history for a run:

```bash
curl http://localhost:4111/api/scouts/{scout-id}/runs/{run-id}/events
```

#### Get Scout Results

```bash
GET /scouts/:scoutId/results?limit=50&offset=0
```

Retrieve the discovered and analyzed content:

```bash
curl http://localhost:4111/api/scouts/{scout-id}/results
```

## Workflow Process

1. **Lookup Scout**: Retrieves scout configuration from database
2. **Create Run Record**: Initializes tracking for this execution
3. **Generate Strategy**: AI agent expands keywords and selects search parameters
4. **Execute Search**: Platform-specific search (Reddit API)
5. **Analyze Content**: AI scores each result for relevance
6. **Store Results**: Batch insert high-quality results
7. **Finalize Run**: Update statistics and schedule next run

## Adding New Platforms

To add Steam or itch.io support:

1. Create a new tool in `tools/platform-search/`:
```typescript
export class SteamSearchTool extends BasePlatformSearchTool {
  platform = 'steam';
  // Implement search() and validateConfig()
}
```

2. Update the search execution step in the workflow to handle the new platform

3. Add platform-specific configuration to the scout's `platform_config`

## Database Schema

- **scouts**: Scout configurations and scheduling
- **scout_runs**: Execution tracking with progress metrics
- **scout_results**: Discovered content with relevance scores
- **scout_run_events**: Detailed event log for debugging

## Development

### Run Tests
```bash
pnpm test
```

### Build
```bash
pnpm build
```

### Monitoring

The workflow uses comprehensive database tracking. Monitor runs by:
- Checking `scout_runs` table for status
- Reviewing `scout_run_events` for step-by-step progress
- Analyzing `scout_results` for discovered content

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify `NEON_DATABASE_URL` is correct
   - Check network connectivity to Neon

2. **AI Analysis Failing**
   - Verify `GOOGLE_GENERATIVE_AI_API_KEY` is valid
   - Check API quotas and rate limits

3. **Reddit Search Errors**
   - Reddit API may rate limit - workflow includes delays
   - Some subreddits may be private or removed

## License

MIT