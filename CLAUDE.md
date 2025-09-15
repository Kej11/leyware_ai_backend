# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Mastra-based AI backend application that provides game scouting services across multiple platforms. The project uses:
- **Mastra Framework**: TypeScript framework for building AI applications, agents, and workflows
- **Google Gemini**: For AI model (gemini-2.5-flash)
- **Platform APIs**: Steam, Reddit, and itch.io for game discovery
- **PostgreSQL**: For persistent storage with Neon
- **Firecrawl**: For web scraping and content extraction

## Commands

### Development
- `pnpm dev` or `mastra dev` - Start the Mastra development server
- `pnpm build` or `mastra build` - Build the project
- `pnpm start` or `mastra start` - Start the built application
- `mastra lint` - Lint the Mastra project

### Testing
- No test scripts are currently configured. When adding tests, update package.json's test script.

## Architecture

### Core Components

1. **Mastra Configuration** (`src/mastra/index.ts`)
   - Central configuration for workflows, agents, storage, and logging
   - Uses PostgreSQL for storage via Neon
   - PinoLogger for structured logging
   - Configures scouting workflows and agents

2. **Scouting Agents** (`src/mastra/agents/`)
   - **Search Planning Agent**: Generates platform-specific search strategies
   - **Content Analysis Agent**: Analyzes discovered content for quality and relevance
   - **Investigation Decision Agent**: Decides which content needs deeper investigation
   - **Storage Decision Agent**: Determines what data to store and how to categorize it
   - **Scout Workflow Agent**: Orchestrates the overall scouting process

3. **Platform Search Tools** (`src/mastra/tools/platform-search/`)
   - **Steam Search Tool**: Searches Steam for demos, games, and community content
   - **Reddit Search Tool**: Searches Reddit for gaming discussions and discoveries
   - **itch.io Search Tool**: Searches itch.io for indie games and projects
   - **Base Search Tool**: Common functionality shared across platforms
   - **Firecrawl Client**: Web scraping capabilities for content extraction

4. **Database Tools** (`src/mastra/tools/database-tools.ts`)
   - Scout configuration management
   - Scout run tracking and status updates
   - Result storage and batch operations
   - Database interaction utilities

5. **Scouting Workflows** (`src/mastra/workflows/`)
   - **Scout Search Workflow**: Basic search execution across platforms
   - **Intelligent Scout Workflow**: Advanced workflow with AI-driven analysis and decision making

### Data Flow
1. Scout configuration defines search parameters and target platforms
2. Search planning agent generates platform-specific strategies
3. Platform search tools execute searches and collect raw data
4. Content analysis agent evaluates and scores discovered content
5. Investigation decision agent determines what needs deeper analysis
6. Storage decision agent categorizes and stores valuable findings
7. Results are tracked in the database with full audit trail

### Database Schema
- **scouts**: Scout configurations with search parameters
- **scout_runs**: Individual execution records with status tracking
- **scout_results**: Discovered content with analysis and scoring
- Support for organizations and user management

## TypeScript Configuration
- Target: ES2022 with bundler module resolution
- Strict mode enabled
- Source files in `src/` directory
- No emit (Mastra handles build process)

## Environment Requirements
- Node.js >= 20.9.0
- Package manager: pnpm
- PostgreSQL database (via Neon)
- API access for target platforms (Steam, Reddit, itch.io)
- Firecrawl API key for web scraping