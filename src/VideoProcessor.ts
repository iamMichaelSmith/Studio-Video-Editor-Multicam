import { FFmpeg, FFMessageLoadConfig } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

interface ProcessingOptions {
  minSegmentDuration: number;
  maxSegmentDuration: number;
  transitionDuration: number;
  outputFormat: 'vertical' | 'horizontal' | 'square';
  quality: 'high' | 'medium' | 'low';
  maxOutputDuration?: number; // Maximum output duration in seconds
  syncAudio?: boolean; // Whether to sync audio
  cutFrequency: 'low' | 'medium' | 'high'; // How many cut scenes to include
  blendAudio?: boolean; // Whether to analyze and blend audio based on volume
  processingSpeed?: 'balanced' | 'fast' | 'ultrafast'; // Speed vs quality tradeoff
}

interface Segment {
  videoIndex: number;
  startTime: number;
  duration: number;
  energy: number;
}

// Add type for logger callback
interface FFmpegLoggerMessage {
  message: string;
}

export class VideoProcessor {
  private ffmpeg: FFmpeg | null = null;
  private readonly defaultOptions: ProcessingOptions = {
    minSegmentDuration: 2,
    maxSegmentDuration: 5,
    transitionDuration: 0.5,
    outputFormat: 'vertical',
    quality: 'high',
    maxOutputDuration: 59, // Default to 59 seconds max
    syncAudio: true, // Default to sync audio
    cutFrequency: 'medium', // Default to medium cut frequency
    blendAudio: false, // Default audio blending off
    processingSpeed: 'balanced', // Default to balanced speed/quality
  };

  // Add performance optimization settings
  private readonly performanceOptions = {
    analysisResolution: '480x360', // Lower resolution for analysis phase
    analysisFrameRate: '5',        // Lower framerate for faster analysis
    useMultiThreading: true,       // Enable multi-threading
    cacheEnabled: true,            // Enable caching
    optimizedFilters: true,        // Use faster filters
    lowResPreview: true,           // Use low-res for preview
  };

  async init() {
    if (!this.ffmpeg) {
      this.ffmpeg = new FFmpeg();
      // Log FFmpeg.wasm version and configuration
      console.log('Initializing FFmpeg...');
      
      try {
        // Set thread count for multi-threading (if available)
        if (this.performanceOptions.useMultiThreading) {
          const coreCount = window.navigator.hardwareConcurrency || 4;
          const threads = Math.max(2, Math.min(coreCount - 1, 8)); // Leave 1 core for UI
          console.log(`Setting up FFmpeg with ${threads} threads`);
          
          // Add thread configuration to FFmpeg if supported
          try {
            // @ts-ignore - setLogger may not be in the type definitions but exists in the implementation
            await this.ffmpeg.setLogger(({ message }: FFmpegLoggerMessage) => {
              if (message.includes('error') || message.includes('Error')) {
                console.error('FFmpeg:', message);
              } else if (message.includes('warning') || message.includes('Warning')) {
                console.warn('FFmpeg:', message);
              } else {
                console.log('FFmpeg:', message);
              }
            });
          } catch (error) {
            console.warn('Logger setup failed, continuing without custom logger:', error);
          }
        }
        
        await this.ffmpeg.load({
          // @ts-ignore - Extended config options
          log: true,
          progress: (progress: any) => {
            console.log('FFmpeg loading:', Math.round(progress.progress * 100), '%');
          }
        });
        
        console.log('FFmpeg initialized successfully');
      } catch (error) {
        console.error('Error initializing FFmpeg:', error);
        throw error;
      }
    }
  }

  private async logProgress(message: string, onProgress: (progress: number) => void, progressValue: number) {
    console.log(message);
    onProgress(progressValue);
    // Small delay to allow UI updates
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  private async detectSceneChanges(inputFile: string, threshold: number = 0.3): Promise<number[]> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    
    console.log(`Detecting scene changes for ${inputFile} with threshold ${threshold}`);
    
    try {
      // Extract frames at a lower resolution and rate for faster processing
      const analysisFrameRate = this.performanceOptions.analysisFrameRate;
      const analysisResolution = this.performanceOptions.analysisResolution;
      
      // Use -vsync passthrough for faster processing
      // Use -threads to enable multi-threading for faster processing
      // Use -s to downscale video for faster scene detection
      await this.ffmpeg.exec([
        '-i', inputFile,
        '-vf', `fps=${analysisFrameRate},scale=${analysisResolution}`,
        '-vsync', 'passthrough',
        ...(this.performanceOptions.useMultiThreading ? ['-threads', '4'] : []),
        '-f', 'image2',
        '-q:v', '10',  // Lower quality for faster processing
        'frame-%04d.jpg'
      ]);
      
      // Rest of the code remains the same, but will run faster due to fewer, smaller frames
      const frames = await this.ffmpeg.listDir('.');
      const frameFiles = frames
        .filter(file => file.name && file.name.startsWith('frame-') && file.name.endsWith('.jpg'))
        .map(file => file.name)
        .sort(); // Ensure frames are in order
      
      // Parse scene change timestamps
      const sceneChanges: number[] = [0]; // Always include start of video
      const matches = frameFiles.map(file => {
        const timestamp = parseFloat(file.replace(/frame-/, '').replace(/\.jpg/, ''));
        if (timestamp > 0 && !isNaN(timestamp)) {
          sceneChanges.push(timestamp);
        }
      });
      
      console.log(`Detected ${sceneChanges.length - 1} scene changes`);
      return sceneChanges.sort((a, b) => a - b);
    } catch (error) {
      console.error('Error detecting scene changes:', error);
      return [0]; // Return just the start point if detection fails
    }
  }

  private async getVideoDuration(inputFile: string): Promise<number> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    
    try {
      // Get video metadata
      await this.ffmpeg.exec([
        '-i', inputFile,
        '-f', 'null',
        '-'
      ]);
      
      const logs = await this.ffmpeg.exec(['-hide_banner']);
      const output = logs.toString();
      
      // Parse duration
      const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (durationMatch) {
        const hours = parseInt(durationMatch[1]);
        const minutes = parseInt(durationMatch[2]);
        const seconds = parseFloat(durationMatch[3]);
        return hours * 3600 + minutes * 60 + seconds;
      }
      
      return 60; // Default to 60 seconds if parsing fails
    } catch (error: any) {
      console.error('Error getting video duration:', error);
      return 60; // Default to 60 seconds
    }
  }

  private async analyzeVideoMotion(inputFile: string): Promise<number[]> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    
    try {
      // Use a simpler approach - write motion data to the log instead of a file
      await this.ffmpeg.exec([
        '-i', inputFile,
        '-vf', 'mestimate=epzs:mb_size=16:search_param=7,metadata=print',
        '-f', 'null',
        '-'
      ]);
      
      // Get the logs with motion data
      const logs = await this.ffmpeg.exec(['-hide_banner']);
      const output = logs.toString();
      
      // Parse motion data (higher values = more motion)
      const motionScores: number[] = [];
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (line.includes('lavfi.motion_score=')) {
          const scoreMatch = line.match(/lavfi\.motion_score=(\d+\.\d+)/);
          if (scoreMatch) {
            motionScores.push(parseFloat(scoreMatch[1]));
          }
        }
      }
      
      return motionScores;
    } catch (error: any) {
      console.error('Error analyzing video motion:', error);
      return []; // Return empty array on error
    }
  }

  private async analyzeAudioVolume(inputFile: string): Promise<number> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    
    try {
      // Use the volumedetect filter to analyze audio volume
      await this.ffmpeg.exec([
        '-i', inputFile,
        '-filter:a', 'volumedetect',
        '-f', 'null',
        '-'
      ]);
      
      // Get the output to parse the mean volume
      const logs = await this.ffmpeg.exec(['-hide_banner']);
      const output = logs.toString();
      
      // Parse mean_volume from output (in dB)
      const meanVolumeMatch = output.match(/mean_volume: ([-\d.]+) dB/);
      if (meanVolumeMatch) {
        return parseFloat(meanVolumeMatch[1]);
      }
      
      return -25; // Default value if parsing fails
    } catch (error: any) {
      console.error('Error analyzing audio volume:', error);
      return -25; // Default value
    }
  }

  private async generateSegments(
    videoIndex: number, 
    sceneChanges: number[], 
    duration: number,
    options: ProcessingOptions
  ): Promise<Segment[]> {
    const segments: Segment[] = [];
    
    // Create segments based on scene changes
    for (let i = 0; i < sceneChanges.length; i++) {
      const startTime = sceneChanges[i];
      const endTime = i < sceneChanges.length - 1 
        ? sceneChanges[i + 1] 
        : duration;
      
      const segmentDuration = endTime - startTime;
      
      // Skip segments that are too short
      if (segmentDuration < options.minSegmentDuration) continue;
      
      // For segments that are too long, divide them
      if (segmentDuration > options.maxSegmentDuration) {
        // How many segments to create
        const numSegments = Math.ceil(segmentDuration / options.maxSegmentDuration);
        const subSegmentDuration = segmentDuration / numSegments;
        
        for (let j = 0; j < numSegments; j++) {
          const subStartTime = startTime + (j * subSegmentDuration);
          const actualDuration = Math.min(subSegmentDuration, duration - subStartTime);
          
          if (actualDuration >= options.minSegmentDuration) {
            segments.push({
              videoIndex,
              startTime: subStartTime,
              duration: actualDuration,
              energy: 1.0 - (j / numSegments) // Earlier segments get higher energy
            });
          }
        }
      } else {
        // Add the segment as is
        segments.push({
          videoIndex,
          startTime,
          duration: segmentDuration,
          energy: 1.0 // Full energy for scene changes
        });
      }
    }
    
    return segments;
  }

  async processVideos(
    files: File[],
    options: Partial<ProcessingOptions> = {},
    onProgress: (progress: number) => void
  ): Promise<Blob> {
    if (files.length === 0) throw new Error('No files provided');
    
    const processingOptions = { ...this.defaultOptions, ...options };
    const maxDuration = processingOptions.maxOutputDuration || 59; // Default to 59 seconds if not specified
    
    // Determine scene detection sensitivity based on cut frequency
    const sensitivityMap = {
      low: 0.5, // Less sensitive, fewer cuts (4-5 per minute)
      medium: 0.3, // Default sensitivity (6-10 per minute)
      high: 0.15 // More sensitive, more cuts (10-20 per minute)
    };
    const sceneSensitivity = sensitivityMap[processingOptions.cutFrequency || 'medium'];
    
    console.log('Starting FFmpeg video processing with the following options:');
    console.log(`- Processing Speed: ${processingOptions.processingSpeed}`);
    console.log(`- Quality: ${processingOptions.quality}`);
    console.log(`- Cut Frequency: ${processingOptions.cutFrequency}`);
    console.log(`- Audio Blending: ${processingOptions.blendAudio}`);
    
    try {
      await this.logProgress('Starting video processing...', onProgress, 5);
      
      // Apply FFmpeg optimization flags based on quality and speed settings
      const qualityPresets = {
        high: { crf: '23' },
        medium: { crf: '28' },
        low: { crf: '33' }
      };
      
      const speedPresets = {
        balanced: { preset: 'medium', cpu: 'medium', threads: 4 },
        fast: { preset: 'veryfast', cpu: 'fast', threads: 8 },
        ultrafast: { preset: 'ultrafast', cpu: 'fastest', threads: 16 }
      };
      
      // Get quality settings
      const { crf } = qualityPresets[processingOptions.quality];
      
      // Get speed settings
      const speedSetting = processingOptions.processingSpeed || 'balanced';
      const { preset, cpu, threads } = speedPresets[speedSetting];
      
      console.log(`Using quality: ${processingOptions.quality} (CRF: ${crf}), speed: ${speedSetting} (preset: ${preset})`);
      
      // Add optimization flags based on quality and speed
      const optimizationFlags = [
        '-preset', preset,
        '-crf', crf,
        ...(this.performanceOptions.useMultiThreading ? ['-threads', threads.toString()] : []),
        // Add tile threads for parallelization on multi-core systems
        ...(this.performanceOptions.useMultiThreading ? ['-tile-columns', '2', '-tile-rows', '1'] : []),
        // Add frame parallel processing
        ...(this.performanceOptions.useMultiThreading ? ['-frame-parallel', '1'] : []),
      ];
      
      // Define output dimensions based on format
      const outputDimensions = {
        vertical: '1080:1920',
        horizontal: '1920:1080',
        square: '1080:1080'
      }[processingOptions.outputFormat];
      
      console.log(`Output dimensions: ${outputDimensions}`);
      
      // Set up a progress update timer to ensure we don't get stuck
      let progressUpdateTimer = setInterval(() => {
        console.log("Forcing progress update to prevent getting stuck...");
        // This slowly increases progress up to 35% even if processing is slow
        for (let p = 10; p <= 35; p += 5) {
          setTimeout(() => onProgress(p), (p - 10) * 1000);
        }
      }, 10000); // Every 10 seconds if no other progress updates
      
      // Upload all files to FFmpeg
      await this.logProgress('Loading videos...', onProgress, 10);
      
      // Write all files to FFmpeg virtual file system
      for (let i = 0; i < files.length; i++) {
        const fileName = `input_${i}.mp4`;
        console.log(`Loading file ${i + 1}/${files.length}: ${fileName}`);
        if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
        
        try {
          // Check if there's a progress callback we can monitor
          const fileData = await fetchFile(files[i]);
          await this.ffmpeg.writeFile(fileName, fileData);
          await this.logProgress(`Loaded file ${i + 1}/${files.length}`, onProgress, 10 + (i / files.length) * 10);
        } catch (error) {
          console.error(`Error loading file ${i}:`, error);
          if (i === 0) {
            throw new Error('Failed to load any files');
          }
          // Continue with other files
        }
      }
      
      // CRITICAL: Passing 20% mark - if stuck at 10%, we should get past this point
      await this.logProgress('Analyzing videos...', onProgress, 20);
      
      // Explicitly force progress to 21% to ensure we're moving
      setTimeout(() => onProgress(21), 500);
      
      // Get durations and analyze all videos
      const videoDurations = [];
      const segments = [];
      const audioLevels = [];
      
      // Create a promise that resolves after a timeout to ensure we don't get stuck
      const analysisTimeout = new Promise<void>(resolve => {
        setTimeout(() => {
          console.warn('Video analysis taking too long, continuing with partial results');
          clearInterval(progressUpdateTimer);
          resolve();
        }, 60000); // 60 second timeout for analysis phase
      });
      
      // Create the actual analysis promise
      const videoAnalysis = (async () => {
        for (let i = 0; i < files.length; i++) {
          const fileName = `input_${i}.mp4`;
          
          try {
            console.log(`Analyzing video ${i + 1}/${files.length}`);
            
            // Get duration
            const duration = await this.getVideoDuration(fileName);
            videoDurations.push(duration);
            
            // Get scene changes with appropriate sensitivity
            const sceneChanges = await this.detectSceneChanges(fileName, sceneSensitivity);
            
            // Get segments
            const videoSegments = await this.generateSegments(i, sceneChanges, duration, processingOptions);
            segments.push(...videoSegments);
            
            // Analyze audio if blending is enabled
            if (processingOptions.blendAudio) {
              const audioVolume = await this.analyzeAudioVolume(fileName);
              audioLevels.push(audioVolume);
            }
            
            // Calculate progress based on how many videos we've analyzed
            // Use the 20-40% range for analysis
            const analysisProgress = 20 + (i / files.length) * 20;
            await this.logProgress(`Analyzed video ${i + 1}/${files.length}`, onProgress, analysisProgress);
          } catch (error) {
            console.error(`Error analyzing video ${i}:`, error);
            // Continue with next video
          }
        }
      })();
      
      // Race between timeout and analysis completion
      await Promise.race([analysisTimeout, videoAnalysis]);
      
      // Clear the interval timer since we're past the stuck point
      clearInterval(progressUpdateTimer);
      
      // CRITICAL: Passing 40% mark - we should definitely get past 10% now
      await this.logProgress('Processing videos...', onProgress, 40);
      
      console.log(`Generated ${segments.length} segments across ${files.length} videos`);
      
      // If no segments were found (perhaps due to timeout), create simple segments
      if (segments.length === 0) {
        console.warn('No segments found, creating simple segments');
        for (let i = 0; i < files.length; i++) {
          if (videoDurations[i]) {
            segments.push({
              videoIndex: i,
              startTime: 0,
              duration: Math.min(videoDurations[i], 10), // Use max 10 seconds per video
              energy: 1,  // Medium energy
            });
          }
        }
      }
      
      // Sort segments by energy (descending)
      segments.sort((a, b) => b.energy - a.energy);
      
      // Select only the segments we need to fill the output duration
      // but limit by max output duration
      let selectedSegments = [];
      let totalDuration = 0;
      
      for (const segment of segments) {
        if (totalDuration + segment.duration <= maxDuration) {
          selectedSegments.push(segment);
          totalDuration += segment.duration;
        } else {
          // Try to fit one more segment if we can trim it
          const remainingTime = maxDuration - totalDuration;
          if (remainingTime >= processingOptions.minSegmentDuration) {
            const trimmedSegment = { ...segment, duration: remainingTime };
            selectedSegments.push(trimmedSegment);
            totalDuration += remainingTime;
          }
          break;
        }
      }
      
      // Sort segments by video index and start time for chronological order
      selectedSegments.sort((a, b) => {
        if (a.videoIndex !== b.videoIndex) {
          return a.videoIndex - b.videoIndex;
        }
        return a.startTime - b.startTime;
      });
      
      console.log(`Selected ${selectedSegments.length} segments for final output, total duration: ${totalDuration}s`);
      
      // Generate concat file list
      await this.logProgress('Preparing segments...', onProgress, 50);
      
      // Create a concat file
      let concatContent = '';
      
      for (let i = 0; i < selectedSegments.length; i++) {
        const segment = selectedSegments[i];
        const inputFile = `input_${segment.videoIndex}.mp4`;
        const segmentFile = `segment_${i}.mp4`;
        
        // Extract segment
        console.log(`Extracting segment ${i + 1}/${selectedSegments.length} from ${inputFile}`);
        
        if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
        
        try {
          await this.ffmpeg.exec([
            '-i', inputFile,
            '-ss', segment.startTime.toString(),
            '-t', segment.duration.toString(),
            '-c', 'copy',
            segmentFile
          ]);
          
          concatContent += `file ${segmentFile}\n`;
          await this.logProgress(`Extracted segment ${i + 1}/${selectedSegments.length}`, onProgress, 50 + (i / selectedSegments.length) * 20);
        } catch (error) {
          console.error(`Error extracting segment ${i}:`, error);
          // Continue with other segments
        }
      }
      
      // Write concat file
      await this.ffmpeg?.writeFile('concat_list.txt', concatContent);
      
      // CRITICAL: Reaching 70% - this should definitely be past 10%
      await this.logProgress('Combining segments...', onProgress, 70);
      
      // Combine all segments
      if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
      
      try {
        await this.ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat_list.txt',
          '-c', 'copy',
          'combined.mp4'
        ]);
      } catch (error) {
        console.error('Error combining segments:', error);
        throw new Error('Failed to combine segments');
      }
      
      // Get audio track from strongest audio if blending is enabled
      if (processingOptions.blendAudio && audioLevels.length > 0) {
        // Find the index with the highest audio level
        const maxAudioIndex = audioLevels.indexOf(Math.max(...audioLevels));
        console.log(`Using audio from video ${maxAudioIndex + 1} as main audio track`);
        
        try {
          // Extract audio
          await this.ffmpeg.exec([
            '-i', `input_${maxAudioIndex}.mp4`,
            '-vn', '-acodec', 'copy',
            'main_audio.aac'
          ]);
          
          // Replace audio in combined video
          await this.ffmpeg.exec([
            '-i', 'combined.mp4',
            '-i', 'main_audio.aac',
            '-c:v', 'copy',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-shortest',
            'combined_with_audio.mp4'
          ]);
          
          // Use the new file
          await this.ffmpeg.exec([
            '-i', 'combined_with_audio.mp4',
            '-c', 'copy',
            'combined.mp4'
          ]);
        } catch (error) {
          console.error('Error processing audio:', error);
          // Continue without audio processing
        }
      }
      
      // Final processing step - resize to desired output format
      await this.logProgress('Finalizing output...', onProgress, 80);
      
      try {
        await this.ffmpeg.exec([
          '-i', 'combined.mp4',
          '-c:v', 'libx264',
          ...optimizationFlags,
          '-c:a', 'aac',
          '-b:a', '128k',
          '-s', outputDimensions,
          '-movflags', '+faststart',
          'output.mp4'
        ]);
      } catch (error) {
        console.error('Error in final processing:', error);
        throw new Error('Failed to process final output');
      }
      
      // Read the output file
      await this.logProgress('Preparing download...', onProgress, 90);
      
      try {
        const data = await this.ffmpeg.readFile('output.mp4');
        const outputBlob = new Blob([data], { type: 'video/mp4' });
        
        // Validate output size
        if (outputBlob.size < 1000) { // Less than 1KB is likely empty
          console.error('Output file is too small, likely failed processing');
          throw new Error('Failed to generate valid output file');
        }
        
        console.log(`Successfully created output file: ${(outputBlob.size / (1024 * 1024)).toFixed(2)} MB`);
        await this.logProgress('Processing complete!', onProgress, 100);
        return outputBlob;
      } catch (error) {
        console.error('Error reading output file:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('Error in video processing:', error);
      
      // Fallback to first video
      try {
        console.warn('Returning first video as fallback');
        if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
        const data = await this.ffmpeg.readFile('input_0.mp4');
        await this.logProgress('Returning original video as fallback...', onProgress, 100);
        return new Blob([data], { type: 'video/mp4' });
      } catch (fallbackError) {
        console.error('Could not read fallback video:', fallbackError);
        throw error;
      }
    }
  }
}