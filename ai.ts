import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'node:fs';
import { CANDIDATE_MODELS, MODEL_COSTS } from './config';
import { SIMPLE_TRANSCRIPTION_PROMPT, REPORT_PROMPT } from './prompts';
import type { TranscriptSegment, CostEstimate } from './types';

/**
 * Model name mapping for CLI convenience
 */
const MODEL_MAP: Record<string, string> = {
  'pro': 'models/gemini-2.5-pro',
  'flash': 'models/gemini-2.5-flash',
  'flash-lite': 'models/gemini-2.0-flash-lite',
};

// CostEstimate type is imported from types.ts

export class GeminiClient {
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;
  private readonly preferredModel: string | null;
  private readonly customInstructions: string | null;
  private readonly usageStats: CostEstimate[] = [];

  constructor(apiKey: string, preferredModel?: string, customInstructions?: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
    // Map short names to full model names
    this.preferredModel = preferredModel ? (MODEL_MAP[preferredModel] || preferredModel) : null;
    this.customInstructions = customInstructions || null;
  }
  
  /**
   * Get total cost estimate from all API calls
   */
  getCostEstimate(): { total: number; breakdown: CostEstimate[] } {
    const total = this.usageStats.reduce((sum, stat) => sum + stat.estimatedCost, 0);
    return { total, breakdown: this.usageStats };
  }
  
  /**
   * Track token usage and estimate cost
   */
  private trackUsage(model: string, inputTokens: number, outputTokens: number): void {
    const costs = MODEL_COSTS[model] || { input: 0.50, output: 1.50 }; // Default fallback
    const estimatedCost = (inputTokens * costs.input / 1_000_000) + (outputTokens * costs.output / 1_000_000);
    
    this.usageStats.push({
      model,
      inputTokens,
      outputTokens,
      estimatedCost
    });
  }

  /**
   * Uploads the file and waits for it to be ready (ACTIVE state).
   */
  async uploadMedia(filePath: string, mimeType: string = 'audio/mp3'): Promise<string> {
    const spinner = ora('Uploading audio to Gemini...').start();
    
    try {
      const uploadResponse = await this.fileManager.uploadFile(filePath, {
        mimeType,
        displayName: "Southbridge Audio",
      });
      
      const fileUri = uploadResponse.file.uri;
      const fileName = uploadResponse.file.name;
      spinner.text = 'Processing audio on Google servers...';

      // Poll until state is ACTIVE
      let file = await this.fileManager.getFile(fileName);
      while (file.state === FileState.PROCESSING) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s
        file = await this.fileManager.getFile(fileName);
      }

      if (file.state === FileState.FAILED) {
        throw new Error("Audio processing failed on Google's side.");
      }

      spinner.succeed('Audio ready for analysis.');
      return fileUri;
    } catch (error) {
      spinner.fail('Upload failed.');
      throw error;
    }
  }

  /**
   * Transcribes the audio using the retry/fallback logic.
   */
  async transcribe(fileUri: string): Promise<any> {
    const spinner = ora('Transcribing with Gemini...').start();

    // Build the prompt with optional custom instructions
    let prompt = SIMPLE_TRANSCRIPTION_PROMPT;
    if (this.customInstructions) {
      prompt += `\n\nADDITIONAL INSTRUCTIONS:\n${this.customInstructions}`;
    }

    // Build model list: preferred model first, then fallbacks
    const modelsToTry = this.preferredModel 
      ? [this.preferredModel, ...CANDIDATE_MODELS.filter(m => m !== this.preferredModel)]
      : CANDIDATE_MODELS;

    for (const modelName of modelsToTry) {
      spinner.text = `Trying model: ${modelName}...`;
      
      try {
        const model = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { responseMimeType: "application/json" }
        });

        const result = await model.generateContent([
          { fileData: { mimeType: "audio/mp3", fileUri } },
          { text: prompt }
        ]);

        const responseText = result.response.text();
        
        // Track token usage for cost estimation
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
          this.trackUsage(
            modelName,
            usageMetadata.promptTokenCount || 0,
            usageMetadata.candidatesTokenCount || 0
          );
        }
        
        spinner.succeed(chalk.green(`Success with ${modelName}`));
        return JSON.parse(responseText);

      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        // Check for Quota/Rate limit errors
        const isQuotaError = 
          errorMsg.includes('429') || 
          errorMsg.includes('503') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('resource_exhausted') ||
          errorMsg.includes('overloaded');
        
        if (isQuotaError) {
          spinner.warn(chalk.yellow(`Quota hit on ${modelName}. Switching...`));
          // Wait a bit before trying next model
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Try next model
        } else {
          // If it's a real error (like bad request), fail immediately
          spinner.fail(`Error on ${modelName}: ${error.message}`);
          throw error;
        }
      }
    }

    throw new Error("All models exhausted. Please try again later.");
  }

  /**
   * Generates a meeting report from the transcript.
   * Analyzes the transcript for key points, decisions, and action items.
   */
  async generateReport(transcript: TranscriptSegment[]): Promise<Record<string, unknown>> {
    const spinner = ora('Generating meeting report...').start();

    // Convert transcript to text for the AI
    const transcriptText = transcript.map((item: TranscriptSegment) => 
      `[${item.start}] ${item.speaker}: ${item.text}`
    ).join('\n');

    const prompt = `${REPORT_PROMPT}\n\nTRANSCRIPT:\n${transcriptText}`;

    // Use faster model for report generation (it's just text analysis)
    const modelName = this.preferredModel || 'models/gemini-2.5-flash';
    
    try {
      const model = this.genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent([{ text: prompt }]);
      const responseText = result.response.text();
      
      // Track token usage
      const usageMetadata = result.response.usageMetadata;
      if (usageMetadata) {
        this.trackUsage(
          modelName,
          usageMetadata.promptTokenCount || 0,
          usageMetadata.candidatesTokenCount || 0
        );
      }
      
      spinner.succeed(chalk.green('Report generated successfully'));
      return JSON.parse(responseText);
      
    } catch (error: any) {
      spinner.fail(`Report generation failed: ${error.message}`);
      throw error;
    }
  }

  // ===========================================
  // NEW: MULTIMODAL ANALYSIS METHODS
  // ===========================================

  /**
   * Analyzes images (screenshots) to understand visual context.
   * Used in the description phase to identify participants, settings, etc.
   * Includes fallback logic for quota errors.
   */
  async analyzeImages(imagePaths: string[], prompt: string): Promise<string> {
    const spinner = ora('Analyzing visual content...').start();

    // Read images and convert to base64
    const imageParts = imagePaths.map(imagePath => {
      const imageData = fs.readFileSync(imagePath);
      const base64 = imageData.toString('base64');
      const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      
      return {
        inlineData: {
          data: base64,
          mimeType,
        }
      };
    });

    // Build model list with fallbacks
    const modelsToTry = this.preferredModel 
      ? [this.preferredModel, ...CANDIDATE_MODELS.filter(m => m !== this.preferredModel)]
      : CANDIDATE_MODELS;

    for (const modelName of modelsToTry) {
      spinner.text = `Analyzing visuals with ${modelName}...`;
      
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          ...imageParts,
          { text: prompt }
        ]);

        const responseText = result.response.text();
        
        // Track usage
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
          this.trackUsage(
            modelName,
            usageMetadata.promptTokenCount || 0,
            usageMetadata.candidatesTokenCount || 0
          );
        }

        spinner.succeed(chalk.green(`Visual analysis complete (${modelName})`));
        return responseText;

      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        const isQuotaError = 
          errorMsg.includes('429') || 
          errorMsg.includes('503') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('resource_exhausted') ||
          errorMsg.includes('overloaded');
        
        if (isQuotaError) {
          spinner.warn(chalk.yellow(`Quota hit on ${modelName}. Switching...`));
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          spinner.fail(`Image analysis failed: ${error.message}`);
          throw error;
        }
      }
    }

    throw new Error("All models exhausted for image analysis. Please try again later.");
  }

  /**
   * Analyzes audio sample to understand content and speakers.
   * Used in the description phase before full transcription.
   * Includes fallback logic for quota errors.
   */
  async analyzeAudio(audioPath: string, prompt: string): Promise<string> {
    const spinner = ora('Analyzing audio content...').start();

    // Upload audio file first (this is shared across all model attempts)
    const fileUri = await this.uploadMedia(audioPath);

    // Build model list with fallbacks
    const modelsToTry = this.preferredModel 
      ? [this.preferredModel, ...CANDIDATE_MODELS.filter(m => m !== this.preferredModel)]
      : CANDIDATE_MODELS;

    for (const modelName of modelsToTry) {
      spinner.text = `Analyzing audio with ${modelName}...`;
      
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          { fileData: { mimeType: 'audio/mp3', fileUri } },
          { text: prompt }
        ]);

        const responseText = result.response.text();
        
        // Track usage
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
          this.trackUsage(
            modelName,
            usageMetadata.promptTokenCount || 0,
            usageMetadata.candidatesTokenCount || 0
          );
        }

        spinner.succeed(chalk.green(`Audio analysis complete (${modelName})`));
        return responseText;

      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        const isQuotaError = 
          errorMsg.includes('429') || 
          errorMsg.includes('503') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('resource_exhausted') ||
          errorMsg.includes('overloaded');
        
        if (isQuotaError) {
          spinner.warn(chalk.yellow(`Quota hit on ${modelName}. Switching...`));
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          spinner.fail(`Audio analysis failed: ${error.message}`);
          throw error;
        }
      }
    }

    throw new Error("All models exhausted for audio analysis. Please try again later.");
  }

  /**
   * Merges visual and audio descriptions into a unified description.
   * Includes fallback logic for quota errors.
   */
  async mergeDescriptions(
    imageDescription: string,
    audioDescription: string,
    prompt: string
  ): Promise<string> {
    const spinner = ora('Merging visual and audio descriptions...').start();

    const fullPrompt = `${prompt}

## Visual Description (from screenshots):
${imageDescription}

## Audio Description (from audio sample):
${audioDescription}

Please provide a unified description that combines both perspectives.`;

    // Build model list with fallbacks
    const modelsToTry = this.preferredModel 
      ? [this.preferredModel, ...CANDIDATE_MODELS.filter(m => m !== this.preferredModel)]
      : CANDIDATE_MODELS;

    for (const modelName of modelsToTry) {
      spinner.text = `Merging descriptions with ${modelName}...`;
      
      try {
        const model = this.genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([{ text: fullPrompt }]);
        const responseText = result.response.text();
        
        // Track usage
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
          this.trackUsage(
            modelName,
            usageMetadata.promptTokenCount || 0,
            usageMetadata.candidatesTokenCount || 0
          );
        }

        spinner.succeed(chalk.green(`Description merge complete (${modelName})`));
        return responseText;

      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        const isQuotaError = 
          errorMsg.includes('429') || 
          errorMsg.includes('503') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('resource_exhausted') ||
          errorMsg.includes('overloaded');
        
        if (isQuotaError) {
          spinner.warn(chalk.yellow(`Quota hit on ${modelName}. Switching...`));
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          spinner.fail(`Description merge failed: ${error.message}`);
          throw error;
        }
      }
    }

    throw new Error("All models exhausted for description merge. Please try again later.");
  }

  /**
   * Transcribes audio with context from the description phase.
   * This is the enhanced transcription that uses meeting context.
   */
  async transcribeWithContext(
    fileUri: string,
    prompt: string
  ): Promise<any> {
    const spinner = ora('Transcribing with context...').start();

    // Build model list: preferred model first, then fallbacks
    const modelsToTry = this.preferredModel 
      ? [this.preferredModel, ...CANDIDATE_MODELS.filter(m => m !== this.preferredModel)]
      : CANDIDATE_MODELS;

    for (const modelName of modelsToTry) {
      spinner.text = `Trying model: ${modelName}...`;
      
      try {
        const model = this.genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: { responseMimeType: "application/json" }
        });

        const result = await model.generateContent([
          { fileData: { mimeType: "audio/mp3", fileUri } },
          { text: prompt }
        ]);

        const responseText = result.response.text();
        
        // Track token usage
        const usageMetadata = result.response.usageMetadata;
        if (usageMetadata) {
          this.trackUsage(
            modelName,
            usageMetadata.promptTokenCount || 0,
            usageMetadata.candidatesTokenCount || 0
          );
        }
        
        spinner.succeed(chalk.green(`Transcribed with ${modelName}`));
        return JSON.parse(responseText);

      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        const isQuotaError = 
          errorMsg.includes('429') || 
          errorMsg.includes('503') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('rate limit') ||
          errorMsg.includes('resource_exhausted') ||
          errorMsg.includes('overloaded');
        
        if (isQuotaError) {
          spinner.warn(chalk.yellow(`Quota hit on ${modelName}. Switching...`));
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        } else {
          spinner.fail(`Error on ${modelName}: ${error.message}`);
          throw error;
        }
      }
    }

    throw new Error("All models exhausted. Please try again later.");
  }
}
