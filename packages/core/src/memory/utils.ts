import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import type {
  AnyAgent,
  Episode,
  WorkingMemory,
  Log,
  ActionResult,
  Action,
  Thought,
} from "../types";
import { z } from "zod";
import { v7 as randomUUIDv7 } from "uuid";
import * as fs from "fs";
import * as path from "path";

export const generateEpisodicMemory = async (
  agent: AnyAgent,
  thoughts: Thought[],
  actions: Action[],
  results: ActionResult[]
): Promise<{
  observation: string;
  thoughts: string;
  result: string;
}> => {
  const extractEpisode = await generateObject({
    model: agent.memory.vectorModel || openai("gpt-4-turbo"),
    schema: z.object({
      observation: z.string().describe("The context and setup - what happened"),
      thoughts: z
        .string()
        .describe(
          "Internal reasoning process and observations of the agent in the episode that let it arrive at the correct action and result. 'I ...'"
        ),
      result: z
        .string()
        .describe(
          "Outcome and retrospective. What did you do well? What could you do better next time? I ..."
        ),
    }),
    prompt: `
    You are creating an episodic memory for an AI agent to help it recall and learn from past experiences.
    
    Your task is to analyze the agent's thoughts, actions, and the results of those actions to create a structured memory that can be used for future reference and learning.

    ## Context
    <thoughts>
    ${JSON.stringify(thoughts)}
    </thoughts>

    ## Actions Taken
    <actions>
    ${JSON.stringify(actions)}
    </actions>

    ## Results & Outcomes
    <results>
    ${JSON.stringify(results)}
    </results>
    
    ## Instructions
    Create a comprehensive episodic memory with these components:
    
    1. OBSERVATION: Provide a clear, concise description of the situation, context, and key elements. Include:
       - What was the environment or scenario?
       - What was the agent trying to accomplish?
       - What were the initial conditions or constraints?
    
    2. THOUGHTS: Capture the agent's internal reasoning process that led to its actions:
       - What was the agent's understanding of the situation?
       - What strategies or approaches did it consider?
       - What key insights or realizations occurred during the process?
       - Use first-person perspective ("I realized...", "I considered...")
    
    3. RESULT: Summarize the outcomes and provide a retrospective analysis:
       - What was accomplished or not accomplished?
       - What worked well and what didn't?
       - What lessons can be learned for future similar situations?
       - What would be done differently next time?
       - Use first-person perspective ("I succeeded in...", "Next time I would...")
    
    Make the memory detailed enough to be useful for future recall, but concise enough to be quickly processed. Focus on capturing the essence of the experience, key decision points, and lessons learned.`,
  });

  return {
    observation: extractEpisode.object.observation,
    thoughts: extractEpisode.object.thoughts,
    result: extractEpisode.object.result,
  };
};

/**
 * Creates a training data pair from episodic memory
 * @param episodicMemory The episodic memory generated
 * @param thoughts The thoughts that led to the actions
 * @param actions The actions taken
 * @param results The results of the actions
 * @returns A prompt-completion pair for training data
 */
export function createTrainingDataPair(episodicMemory: {
  observation: string;
  thoughts: string;
  result: string;
}): {
  prompt: string;
  completion: string;
} {
  // Create a simple prompt with the observation
  const prompt = episodicMemory.observation;

  // Create a simple completion with thoughts and result
  const completion = `${episodicMemory.thoughts}\n\n${episodicMemory.result}`;

  return {
    prompt,
    completion,
  };
}

/**
 * Saves training data to a JSON lines file
 * @param trainingData Array of prompt-completion pairs
 * @param filePath Path to save the file
 */
export async function saveTrainingData(
  trainingData: Array<{ prompt: string; completion: string }>,
  filePath: string
): Promise<void> {
  try {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Convert each object to a JSON string and join with newlines
    const jsonLines = trainingData
      .map((item) => JSON.stringify(item))
      .join("\n");

    // Write to file
    fs.writeFileSync(filePath, jsonLines, "utf8");

    console.log(`Training data saved to ${filePath}`);
  } catch (error) {
    console.error("Error saving training data:", error);
    throw error;
  }
}

/**
 * Creates an episode from working memory components
 * @param thoughts The thoughts that led to the actions
 * @param actions The actions taken
 * @param results The results of the actions
 * @param agent The agent that generated the episode
 * @param options Optional configuration for exporting training data
 * @param options.exportTrainingData Whether to export this episode as training data
 * @param options.trainingDataPath Path to save the training data
 * @returns A new Episode object
 */
export async function createEpisodeFromWorkingMemory(
  thoughts: Thought[],
  actions: Action[],
  results: ActionResult[],
  agent: AnyAgent,
  options?: {
    exportTrainingData?: boolean;
    trainingDataPath?: string;
  }
): Promise<Episode> {
  const episodicMemory = await generateEpisodicMemory(
    agent,
    thoughts,
    actions,
    results
  );

  // If exportTrainingData is true, create and save training data
  if (options?.exportTrainingData) {
    const trainingDataPair = createTrainingDataPair(episodicMemory);

    // Default path if not provided
    const filePath = options.trainingDataPath || "./training-data.jsonl";

    // Check if file exists to append or create new
    let existingData: Array<{ prompt: string; completion: string }> = [];
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, "utf8");
      existingData = fileContent
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => JSON.parse(line));
    }

    // Add new training data pair
    existingData.push(trainingDataPair);

    // Save updated training data
    await saveTrainingData(existingData, filePath);
  }

  return {
    id: randomUUIDv7(),
    timestamp: Date.now(),
    observation: episodicMemory.observation,
    result: episodicMemory.result,
    thoughts: episodicMemory.thoughts,
  };
}

/**
 * Exports all episodes as training data
 * @param episodes Array of episodes to export
 * @param filePath Path to save the training data
 */
export async function exportEpisodesAsTrainingData(
  episodes: Episode[],
  filePath: string = "./training-data.jsonl"
): Promise<void> {
  const trainingData = episodes.map((episode) => ({
    prompt: episode.observation,
    completion: `${episode.thoughts}\n\n${episode.result}`,
  }));

  await saveTrainingData(trainingData, filePath);
}
