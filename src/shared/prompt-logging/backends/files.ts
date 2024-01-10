import { promises as fs } from 'fs';
import * as path from 'path';
import { USER_ASSETS_DIR, config } from '../../../config';
import { logger } from "../../../logger";

let currentFileNumber = 0;
let currentFilePath = '';
let currentFileSize = 0;
let islogging = false;

export { currentFileNumber, islogging};

export const fileBackend: FileBackend = {
  init: async (onStop: () => void) => {
    try {
      await createNewLogFile();
      process.on('SIGINT', onStop);
      process.on('SIGTERM', onStop);
    } catch (error) {
      logger.error('Error initializing file backend', error);
      throw error;
    }
  },
  appendBatch: async (batch: PromptLogEntry[]) => {
    try {
      for (const entry of batch) {
        const line = JSON.stringify(entry) + '\n';
        const lineSize = Buffer.byteLength(line);

        if (currentFileSize + lineSize > config.promptLoggingMaxFileSize * 1024 * 1024) {
          await createNewLogFile();
        }
        logger.debug(`Writing to file: ${currentFilePath}`)
        await fs.appendFile(currentFilePath, line);
        currentFileSize += lineSize;
      }
    } catch (error) {
      logger.error('Error appending batch to file', error);
      throw error;
    }
  }
};

async function createNewLogFile() {
    if (currentFileNumber >= config.promptLoggingFilecount) {
        logger.info('Maximum file number reached, logging will stop.');
        islogging = false;
        return;
      }
  currentFileNumber++;
  currentFilePath = path.join(USER_ASSETS_DIR, `${config.promptLoggingPrefix}${currentFileNumber}.jsonl`);
  currentFileSize = 0;

  await fs.writeFile(currentFilePath, '');
  logger.info(`Created new log file: ${currentFilePath}`);
  islogging = true;
}

interface FileBackend {
  init: (onStop: () => void) => Promise<void>;
  appendBatch: (batch: PromptLogEntry[]) => Promise<void>;
}

interface PromptLogEntry {
  model: string;
  endpoint: string;
  promptRaw: string;
  promptFlattened: string;
  response: string;
}