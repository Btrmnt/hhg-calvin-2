import 'dotenv/config';

export const llmConfig = {
  // Default to OpenAI GPT-4o-mini for cost efficiency
  defaultModel: 'gpt-4o-mini',
  
  // API keys from environment
  openai: {
    apiKey: process.env.OPENAI_API_KEY
  },
  
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  
  google: {
    apiKey: process.env.GOOGLE_API_KEY
  },
  
  // Common settings for scheduling tasks
  scheduling: {
    temperature: 0.1, // Low temperature for consistent scheduling decisions
    maxTokens: 1000,
    responseFormat: 'json'
  }
};