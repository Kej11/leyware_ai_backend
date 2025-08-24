# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Mastra-based AI backend application that provides weather information and activity planning services. The project uses:
- **Mastra Framework**: TypeScript framework for building AI applications, agents, and workflows
- **Google Gemini**: For AI model (gemini-2.5-pro)
- **Open-Meteo API**: For weather data fetching
- **LibSQL**: For storage (in-memory or file-based)

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
   - Uses LibSQL for storage (defaults to in-memory, can persist to file)
   - PinoLogger for structured logging

2. **Weather Agent** (`src/mastra/agents/weather-agent.ts`)
   - AI agent powered by Google Gemini 2.5 Pro
   - Provides weather information and activity planning
   - Has access to weatherTool for fetching current weather data
   - Includes memory persistence using LibSQL

3. **Weather Tool** (`src/mastra/tools/weather-tool.ts`)
   - Fetches current weather for a location
   - Uses Open-Meteo API for geocoding and weather data
   - Returns temperature, humidity, wind speed, and conditions

4. **Weather Workflow** (`src/mastra/workflows/weather-workflow.ts`)
   - Two-step workflow: fetch weather → plan activities
   - Fetches weather forecast data
   - Uses the weather agent to suggest location-specific activities
   - Streams responses to stdout

### Data Flow
1. User requests weather/activities for a city
2. Geocoding API converts city name to coordinates
3. Weather API fetches current/forecast data
4. AI agent processes data and suggests activities
5. Results are streamed or returned to the user

## TypeScript Configuration
- Target: ES2022 with bundler module resolution
- Strict mode enabled
- Source files in `src/` directory
- No emit (Mastra handles build process)

## Environment Requirements
- Node.js >= 20.9.0
- Package manager: pnpm