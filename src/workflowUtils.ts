import { ProcessingOptions } from './SimpleVideoProcessor';

export type ProcessingStage = 'idle' | 'validating' | 'analyzing' | 'syncing' | 'rendering' | 'finalizing' | 'done' | 'cancelled' | 'error';

export const PRESET_OPTIONS: Record<string, Partial<ProcessingOptions>> = {
  reels: { outputFormat: 'vertical', quality: 'high', maxOutputDuration: 60, cutFrequency: 'high', processingSpeed: 'fast' },
  shorts: { outputFormat: 'vertical', quality: 'high', maxOutputDuration: 60, cutFrequency: 'medium', processingSpeed: 'balanced' },
  tiktok: { outputFormat: 'vertical', quality: 'medium', maxOutputDuration: 60, cutFrequency: 'high', processingSpeed: 'ultrafast' }
};

export const ALLOWED_EXTENSIONS = ['mp4', 'mov', 'webm', 'avi'];
export const MAX_FILE_SIZE_MB = 500;
export const MAX_FILES = 12;

export function detectStage(progress: number): ProcessingStage {
  if (progress >= 100) return 'done';
  if (progress >= 95) return 'finalizing';
  if (progress >= 60) return 'rendering';
  if (progress >= 35) return 'syncing';
  if (progress >= 1) return 'analyzing';
  return 'validating';
}

export function stageLabel(stage: ProcessingStage): string {
  switch (stage) {
    case 'validating': return 'Validating files';
    case 'analyzing': return 'Analyzing scenes';
    case 'syncing': return 'Synchronizing audio/video';
    case 'rendering': return 'Rendering output';
    case 'finalizing': return 'Finalizing export';
    case 'done': return 'Done';
    case 'cancelled': return 'Cancelled';
    case 'error': return 'Failed';
    default: return 'Idle';
  }
}

export function validateFiles(inputFiles: File[]): string[] {
  const errors: string[] = [];
  if (inputFiles.length === 0) errors.push('Please add at least one video file.');
  if (inputFiles.length > MAX_FILES) errors.push(`Please upload up to ${MAX_FILES} files max.`);

  for (const file of inputFiles) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      errors.push(`${file.name}: unsupported format (${ext || 'unknown'}). Use MP4, MOV, WebM, or AVI.`);
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_SIZE_MB) {
      errors.push(`${file.name}: exceeds ${MAX_FILE_SIZE_MB}MB limit.`);
    }
  }

  return [...new Set(errors)];
}
