export interface ProcessingOptions {
  minSegmentDuration: number;
  maxSegmentDuration: number;
  transitionDuration: number;
  outputFormat: 'vertical' | 'horizontal' | 'square';
  quality: 'high' | 'medium' | 'low';
  maxOutputDuration?: number;
  syncAudio?: boolean;
  cutFrequency: 'low' | 'medium' | 'high';
  blendAudio?: boolean;
  processingSpeed?: 'balanced' | 'fast' | 'ultrafast';
  audioSmoothingTime?: number;
  transitionType?: 'hard' | 'fade';
  multicamMode?: boolean;
}

// Add interfaces for video elements with browser-specific capture methods
interface EnhancedVideoElement extends HTMLVideoElement {
  startTime?: number;
  durationLimit?: number;
  audioTrack?: MediaStreamTrack;
  audioContext?: AudioContext;
  audioSource?: MediaStreamAudioSourceNode;
  audioDestination?: MediaStreamAudioDestinationNode;
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
  timeScaleFactor?: number;
}

// Add a type for the window object to allow gc method
interface WindowWithGC extends Window {
  gc?: () => void;
}

// Add an interface to track video segments with importance scores
interface VideoSegment {
  videoIndex: number;
  startTime: number;
  duration: number;
  importance: number; // Higher is more important/interesting
  sequenceId?: string; // Make sequenceId optional
  timePosition?: number;
}

export class SimpleVideoProcessor {
  private initialized = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  // Default options
  private defaultOptions: ProcessingOptions = {
    minSegmentDuration: 2,
    maxSegmentDuration: 5,
    transitionDuration: 0.5,
    outputFormat: 'horizontal',
    quality: 'medium',
    maxOutputDuration: 60,
    syncAudio: true,
    cutFrequency: 'medium',
    blendAudio: false,
    processingSpeed: 'balanced',
    audioSmoothingTime: 0.8,
    transitionType: 'hard', // Default to hard cuts
    multicamMode: false  // Default to standard mode
  };

  constructor() {
    // Create canvas elements
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { alpha: false })!;
  }

  async init(): Promise<void> {
    this.initialized = true;
    console.log('SimpleVideoProcessor initialized');
    return Promise.resolve();
  }

  /**
   * Process videos
   */
  async processVideos(
    videos: File[],
    partialOptions: Partial<ProcessingOptions> = {},
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    try {
      // Combine with default options
      const options: ProcessingOptions = {
        ...this.defaultOptions,
        ...partialOptions
      };
      
      console.log(`Processing videos with options:`, options);
      console.log(`Processing speed: ${options.processingSpeed}, quality: ${options.quality}, cut frequency: ${options.cutFrequency}`);
      
      // Ensure we're initialized
      if (!this.initialized) {
        await this.init();
      }
      
      if (videos.length === 0) {
        throw new Error('No videos provided');
      }
      
      // For single video processing, if the duration is under the target, use direct processing
      if (videos.length === 1) {
        const video = videos[0];
        if (onProgress) onProgress(15);
        
        const videoElement = await this.loadVideo(video);
        const videoDuration = videoElement.duration;
        
        // If maxOutputDuration is not set or is greater than the video duration,
        // or we're specifically requesting a full-length video
        if (!options.maxOutputDuration || videoDuration <= options.maxOutputDuration) {
          console.log(`Single video under target duration (${videoDuration}s), using direct processing`);
          return this.processSingleVideo(video, options, onProgress);
        }
      }
      
      // For multiple videos or single videos that need trimming,
      // use the new improved synchronization-based processing
      console.log(`Using multiple video processing with synchronization`);
      return this.processMultipleVideos(videos, options, onProgress);
    } catch (error) {
      console.error('Error in processVideos:', error);
      
      // Try to return the first video if processing fails
      if (videos.length > 0) {
        try {
          console.warn('Falling back to first video due to processing error');
          const firstVideo = videos[0];
          
          // Process without any fancy options to maximize chances of success
          const fallbackOptions: ProcessingOptions = {
            ...this.defaultOptions,
            quality: 'low',
            syncAudio: false,
            blendAudio: false,
            processingSpeed: 'ultrafast'
          };
          
          if (onProgress) onProgress(5); // Reset progress to indicate fallback
          return this.processSingleVideo(firstVideo, fallbackOptions, onProgress);
        } catch (fallbackError) {
          console.error('Fallback processing also failed:', fallbackError);
          throw new Error('Failed to process videos, even with fallback method');
        }
      }
      
      throw error;
    }
  }

  /**
   * Process videos using analyzed segments
   */
  async processMultipleVideos(
    videos: File[],
    options: ProcessingOptions,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    try {
      console.log(`Processing ${videos.length} videos with options:`, options);
      console.log(`MultiCam Mode: ${options.multicamMode ? 'Enabled' : 'Disabled'}`);
      
      if (onProgress) onProgress(10);
      
      // Load videos into HTML elements
      const videoElements = await Promise.all(
        videos.map(async (video) => {
          try {
            return await this.loadVideo(video);
          } catch (error) {
            console.error(`Error loading video ${video.name}:`, error);
            throw error;
          }
        })
      );
      
      // Log duration information for time synchronization
      const totalDuration = videoElements.reduce((total, video) => total + video.duration, 0);
      const avgDuration = totalDuration / videoElements.length;
      
      console.log(`Total duration of all videos: ${totalDuration.toFixed(1)}s`);
      console.log(`Average video duration: ${avgDuration.toFixed(1)}s`);
      
      // Setup time synchronization
      if (options.multicamMode && videos.length > 1) {
        console.log('Using advanced audio-based synchronization for multicam editing');
        await this.synchronizeVideoTimelines(videoElements);
      } else {
        console.log('Using basic temporal alignment');
        await this.basicSynchronizeVideoTimelines(videoElements);
      }
      
      if (onProgress) onProgress(20);
      
      // Set up canvas dimensions based on output format
      this.setupCanvasDimensions(videoElements[0], options.outputFormat);
      
      if (onProgress) onProgress(30);
      
      console.log('Analyzing videos for interesting segments...');
      
      // Find interesting segments in each video
      const segments = await this.analyzeVideosForSegments(videoElements, options, onProgress);
      
      if (onProgress) onProgress(40);
      
      // For multicam mode, ensure we have segments from all cameras
      if (options.multicamMode && videos.length > 1) {
        console.log('Optimizing segment selection for multicam editing...');
        this.optimizeMulticamSegments(segments, videoElements, options);
      }
      
      // Concatenate videos using analyzed segments
      return await this.concatenateVideosWithSegments(videoElements, segments, options, onProgress);
    } catch (error) {
      console.error('Error in processMultipleVideos:', error);
      throw error;
    }
  }

  /**
   * Basic synchronization method that uses duration scaling
   * Used as a fallback when multicam mode is disabled
   */
  private async basicSynchronizeVideoTimelines(videos: HTMLVideoElement[]): Promise<void> {
    if (videos.length < 2) {
      console.log('Only one video, no synchronization needed');
      return;
    }
    
    console.log('Synchronizing video timelines for consistent cuts...');
    
    // We'll use the first video as our reference timeline
    const referenceVideo = videos[0] as EnhancedVideoElement;
    const referenceDuration = referenceVideo.duration;
    
    // Add timeline metadata to each video
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i] as EnhancedVideoElement;
      
      // If this is not the reference video, establish a relationship with the reference
      if (i > 0) {
        // Calculate a time scaling factor for temporal alignment
        // This ensures that proportional positions in each video represent the same "moment"
        const timeScaleFactor = referenceDuration / video.duration;
        video.timeScaleFactor = timeScaleFactor;
        video.startTime = 0;
        
        console.log(`Video ${i+1} time scale factor: ${timeScaleFactor.toFixed(3)}`);
      } else {
        video.timeScaleFactor = 1.0; // Reference video has 1:1 scaling
        video.startTime = 0;
      }
    }
    
    console.log('Video timelines synchronized using basic method');
  }
  
  /**
   * Optimize segment selection for multicam editing
   * Ensures we get a good mix of camera angles
   */
  private optimizeMulticamSegments(
    segments: VideoSegment[],
    videos: HTMLVideoElement[],
    options: ProcessingOptions
  ): void {
    if (segments.length < 2 || videos.length < 2) return;
    
    console.log('Balancing segment selection across camera angles...');
    
    // Group segments by camera (videoIndex)
    const segmentsByCamera: {[key: number]: VideoSegment[]} = {};
    
    for (const segment of segments) {
      if (!segmentsByCamera[segment.videoIndex]) {
        segmentsByCamera[segment.videoIndex] = [];
      }
      segmentsByCamera[segment.videoIndex].push(segment);
    }
    
    // Log segment distribution
    Object.keys(segmentsByCamera).forEach(camIndex => {
      const cameraSegments = segmentsByCamera[Number(camIndex)];
      console.log(`Camera ${Number(camIndex) + 1}: ${cameraSegments.length} segments`);
    });
    
    // Balance camera usage based on cut frequency
    let targetCutFrequency: number;
    switch (options.cutFrequency) {
      case 'low': targetCutFrequency = 5; break;    // Cut every ~5 seconds
      case 'high': targetCutFrequency = 2; break;   // Cut every ~2 seconds
      default: targetCutFrequency = 3; break;       // Medium: cut every ~3 seconds
    }
    
    // Sort all segments by importance
    segments.sort((a, b) => b.importance - a.importance);
    
    // Add camera change flags to segments
    let lastCameraIndex = -1;
    let timeElapsed = 0;
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // If enough time has elapsed since last camera change, try to switch cameras
      if (timeElapsed >= targetCutFrequency && segment.videoIndex !== lastCameraIndex) {
        segment.importance += 0.5; // Boost importance to encourage selection
        lastCameraIndex = segment.videoIndex;
        timeElapsed = 0;
      } else {
        timeElapsed += segment.duration;
      }
    }
    
    console.log('Segment selection optimized for multicam editing');
  }

  /**
   * Synchronize video timelines to align videos temporally
   * This ensures cuts between cameras maintain time consistency
   */
  private async synchronizeVideoTimelines(videos: HTMLVideoElement[]): Promise<void> {
    if (videos.length < 2) {
      console.log('Only one video, no synchronization needed');
      return;
    }
    
    console.log('Synchronizing video timelines using audio analysis...');
    
    // We'll use the first video as our reference timeline
    const referenceVideo = videos[0] as EnhancedVideoElement;
    const referenceDuration = referenceVideo.duration;
    
    try {
      // Create audio contexts for analysis
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioData: Float32Array[] = [];
      
      // Step 1: Extract audio data from each video
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as EnhancedVideoElement;
        console.log(`Extracting audio from video ${i+1}...`);
        
        // Create media elements source
        const source = audioContext.createMediaElementSource(video);
        const analyser = audioContext.createAnalyser();
        const dataArray = new Float32Array(analyser.fftSize);
        
        // Connect source to analyser
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        // Sample audio data
        video.currentTime = 0;
        await new Promise(resolve => {
          video.oncanplaythrough = resolve;
          video.play().catch(e => console.error("Play error:", e));
        });
        
        // Wait a moment to collect audio data
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Get audio data
        analyser.getFloatTimeDomainData(dataArray);
        audioData.push(new Float32Array(dataArray));
        
        // Disconnect and reset
        source.disconnect();
        analyser.disconnect();
        video.pause();
        video.currentTime = 0;
      }
      
      // Step 2: Perform cross-correlation to find offsets
      console.log('Analyzing audio for synchronization...');
      const offsets: number[] = [0]; // Reference video has zero offset
      
      for (let i = 1; i < videos.length; i++) {
        const offset = this.findAudioOffset(audioData[0], audioData[i]);
        offsets.push(offset);
        console.log(`Video ${i+1} offset from reference: ${offset.toFixed(3)} seconds`);
      }
      
      // Step 3: Apply time offsets and scaling to each video
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as EnhancedVideoElement;
        
        // Set startTime based on detected offset
        video.startTime = offsets[i] > 0 ? offsets[i] : 0;
        
        // Calculate effective duration after applying offset
        const effectiveDuration = video.duration - video.startTime;
        
        // Calculate time scaling factor for temporal alignment
        const timeScaleFactor = referenceDuration / effectiveDuration;
        video.timeScaleFactor = timeScaleFactor;
        
        console.log(`Video ${i+1}: startTime=${video.startTime.toFixed(3)}s, timeScaleFactor=${timeScaleFactor.toFixed(3)}`);
      }
      
      // Clean up
      audioContext.close();
      
    } catch (error) {
      console.error('Error during audio synchronization:', error);
      console.warn('Falling back to basic temporal alignment...');
      
      // Fallback: Use simple duration-based scaling
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as EnhancedVideoElement;
        video.startTime = 0;
        video.timeScaleFactor = i === 0 ? 1.0 : referenceDuration / video.duration;
      }
    }
    
    console.log('Video timelines synchronized');
  }
  
  /**
   * Find the time offset between two audio samples using cross-correlation
   * @param reference The reference audio data
   * @param target The target audio data to align with reference
   * @returns Time offset in seconds
   */
  private findAudioOffset(reference: Float32Array, target: Float32Array): number {
    console.log('Performing cross-correlation for audio alignment...');
    
    // For efficiency, use a subset of the audio data
    const maxSamples = 4096;
    const refSamples = reference.length > maxSamples ? 
      reference.slice(0, maxSamples) : reference;
    const targetSamples = target.length > maxSamples ?
      target.slice(0, maxSamples) : target;
    
    // Normalize audio samples
    const normalizeArray = (arr: Float32Array): Float32Array => {
      const result = new Float32Array(arr.length);
      const max = Math.max(...Array.from(arr).map(Math.abs));
      for (let i = 0; i < arr.length; i++) {
        result[i] = arr[i] / max;
      }
      return result;
    };
    
    const normalizedRef = normalizeArray(refSamples);
    const normalizedTarget = normalizeArray(targetSamples);
    
    // Perform cross-correlation to find the best match
    let maxCorrelation = -Infinity;
    let bestOffset = 0;
    
    // Only search within a reasonable offset range (±2 seconds at 48kHz)
    const maxOffsetSamples = 2 * 48000;
    const searchLength = Math.min(maxOffsetSamples, normalizedRef.length);
    
    for (let offset = -searchLength; offset < searchLength; offset++) {
      let correlation = 0;
      let validSamples = 0;
      
      for (let i = 0; i < normalizedRef.length; i++) {
        const targetIndex = i + offset;
        if (targetIndex >= 0 && targetIndex < normalizedTarget.length) {
          correlation += normalizedRef[i] * normalizedTarget[targetIndex];
          validSamples++;
        }
      }
      
      // Normalize by the number of valid overlapping samples
      if (validSamples > 0) {
        correlation /= validSamples;
        
        if (correlation > maxCorrelation) {
          maxCorrelation = correlation;
          bestOffset = offset;
        }
      }
    }
    
    // Convert sample offset to time (seconds)
    // Assume 48kHz sample rate
    const sampleRate = 48000;
    const timeOffset = bestOffset / sampleRate;
    
    console.log(`Best audio correlation: ${maxCorrelation.toFixed(3)} at offset: ${timeOffset.toFixed(3)}s`);
    return timeOffset;
  }

  /**
   * Analyze videos to find interesting segments
   */
  private async analyzeVideosForSegments(
    videos: HTMLVideoElement[],
    options: ProcessingOptions,
    onProgress?: (progress: number) => void
  ): Promise<VideoSegment[]> {
    console.log('Starting video segment analysis');
    const segments: VideoSegment[] = [];
    const offscreenCanvas = document.createElement('canvas');
    const ctx = offscreenCanvas.getContext('2d', { alpha: false })!;
    
    // How many seconds to jump for each analysis step - make this more aggressive for high frequency
    const analysisStep = options.cutFrequency === 'high' ? 0.25 : 
                        options.cutFrequency === 'medium' ? 1 : 2;
    
    // For full-length video option, use fewer analysis points
    const isFullLength = !options.maxOutputDuration;
    const skipFactor = isFullLength ? (options.cutFrequency === 'high' ? 1 : 2) : 1; // Don't skip frames for high frequency
                        
    // Keep track of the total processed duration to avoid exceeding maxOutputDuration
    let totalDuration = 0;
    const maxDuration = options.maxOutputDuration ?? Number.MAX_SAFE_INTEGER;
    
    // Determine the shortest video to use as a reference
    // This ensures we can align our cuts between cameras at the same relative points in time
    const shortestVideo = videos.reduce(
      (shortest, current) => current.duration < shortest.duration ? current : shortest,
      videos[0]
    );
    const shortestDuration = shortestVideo.duration;
    
    // Calculate segment boundaries for synchronized cuts
    const segmentBoundaries: number[] = [];
    
    // Base segment size on cut frequency
    const segmentSize = options.cutFrequency === 'high' ? 2 : 
                        options.cutFrequency === 'medium' ? 4 : 8;
    
    // Create segment boundaries at regular intervals
    for (let time = 0; time < shortestDuration; time += segmentSize) {
      segmentBoundaries.push(time);
    }
    
    console.log(`Created ${segmentBoundaries.length} synchronized segment boundaries`);
    
    // Now analyze each video at these synchronized points
    for (let videoIndex = 0; videoIndex < videos.length; videoIndex++) {
      const video = videos[videoIndex] as EnhancedVideoElement;
      const timeScaleFactor = video.timeScaleFactor || 1.0;
      
      console.log(`Analyzing video ${videoIndex + 1}/${videos.length}, duration: ${video.duration}s, time scale: ${timeScaleFactor}`);
      
      // Set canvas to video dimensions for analysis
      offscreenCanvas.width = video.videoWidth;
      offscreenCanvas.height = video.videoHeight;
      
      // If full length mode is enabled, create segments aligned with boundaries
      if (isFullLength) {
        console.log('Full length mode: creating aligned segments covering entire video');
        
        // For each segment boundary, create a segment
        for (let i = 0; i < segmentBoundaries.length; i++) {
          const startTime = segmentBoundaries[i] / timeScaleFactor; // Adjust for this video's timeline
          const endTime = (i < segmentBoundaries.length - 1) 
            ? segmentBoundaries[i + 1] / timeScaleFactor 
            : video.duration;
          
          const duration = Math.min(endTime - startTime, options.maxSegmentDuration);
          
          // Only add if the segment is long enough
          if (duration >= options.minSegmentDuration && startTime < video.duration) {
            segments.push({
              videoIndex,
              startTime,
              duration,
              importance: 0.7, // Medium-high importance for all segments
              sequenceId: `${videoIndex}-${startTime.toFixed(1)}`,
              timePosition: segmentBoundaries[i] // Store original boundary for synchronization
            });
            
            console.log(`Created segment at ${startTime.toFixed(1)}s with duration ${duration.toFixed(1)}s (boundary: ${segmentBoundaries[i].toFixed(1)}s)`);
          }
        }
      }
      
      // Also analyze frames to find important moments
      let lastImportance = 0;
      
      // Analyze each boundary as these are likely good cut points
      for (const boundary of segmentBoundaries) {
        // Convert boundary time to this video's timeline
        const currentTime = boundary / timeScaleFactor;
        
        // Skip if beyond this video's duration
        if (currentTime >= video.duration) continue;
        
        // Update progress (map 30-40%)
        if (onProgress) {
          const boundaryProgress = segmentBoundaries.indexOf(boundary) / segmentBoundaries.length;
          const overallProgress = 30 + Math.floor((videoIndex / videos.length + boundaryProgress / videos.length) * 10);
          onProgress(overallProgress);
        }
        
        // Seek to the current time
        video.currentTime = currentTime;
        
        // Wait for seek to complete
        await new Promise<void>(resolve => {
          const seekHandler = () => {
            video.removeEventListener('seeked', seekHandler);
            resolve();
          };
          video.addEventListener('seeked', seekHandler);
        });
        
        // Capture the current frame
        ctx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
        
        // Get frame data for analysis
        const imageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        
        // Calculate importance of this frame (brightness, contrast, motion)
        const importance = this.calculateFrameImportance(imageData, lastImportance);
        lastImportance = importance;
        
        // Adjust importance threshold based on cut frequency
        const importanceThreshold = options.cutFrequency === 'high' ? 0.4 : 
                                   options.cutFrequency === 'medium' ? 0.5 : 0.6;
        
        // If this is a high-importance frame, mark it as a potential segment start
        if (importance > importanceThreshold) {
          console.log(`Found interesting segment at ${currentTime}s with importance ${importance.toFixed(2)}`);
          
          // For high-importance segments, we've already created the base segments above,
          // but we'll update their importance score
          const existingSegment = segments.find(s => 
            s.videoIndex === videoIndex && 
            Math.abs(s.startTime - currentTime) < 0.5
          );
          
          if (existingSegment) {
            existingSegment.importance = Math.max(existingSegment.importance, importance);
            console.log(`Updated segment importance to ${importance.toFixed(2)}`);
          } else {
            // If no existing segment, create a new one
            segments.push({
              videoIndex,
              startTime: currentTime,
              duration: Math.min(options.maxSegmentDuration, video.duration - currentTime),
              importance,
              sequenceId: `${videoIndex}-${currentTime.toFixed(1)}`,
              timePosition: boundary // Store original boundary for synchronization
            });
          }
        }
      }
      
      // If we found no segments for this video, add one default segment
      if (!segments.some(s => s.videoIndex === videoIndex)) {
        console.log(`No segments found for video ${videoIndex + 1}, adding default segment`);
        segments.push({
          videoIndex,
          startTime: 0,
          duration: Math.min(options.maxSegmentDuration, video.duration),
          importance: 0.5,
          sequenceId: `${videoIndex}-0.0`,
          timePosition: 0
        });
      }
    }
    
    // Sort segments by time position first, then by importance
    segments.sort((a, b) => {
      // First sort by time position (for synchronized cuts)
      if (a.timePosition !== b.timePosition) {
        return (a.timePosition || 0) - (b.timePosition || 0);
      }
      // Then by importance (higher importance first)
      return b.importance - a.importance;
    });
    
    console.log(`Found ${segments.length} interesting segments across all videos`);
    return segments;
  }
  
  /**
   * Concatenate videos using the selected segments
   */
  private async concatenateVideosWithSegments(
    videos: HTMLVideoElement[],
    segments: VideoSegment[],
    options: ProcessingOptions,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    console.log(`Concatenating ${segments.length} video segments with options:`, options);
    
    // Sort segments by importance (highest first)
    segments.sort((a, b) => b.importance - a.importance);
    
    // Set a duration limit or use all segments if no limit specified
    const effectiveDurationLimit = options.maxOutputDuration || Number.MAX_SAFE_INTEGER;
    
    console.log(`Effective duration limit: ${effectiveDurationLimit}s`);
    
    // Select segments up to the duration limit
    const selectedSegments: VideoSegment[] = [];
    let totalDurationSelected = 0;
    
    // For multicam mode, ensure we balance camera selections
    if (options.multicamMode && videos.length > 1) {
      console.log('Using optimized multicam segment selection strategy');
      
      // Pre-process segments for multicam editing
      const cameraCounts: {[key: number]: number} = {};
      segments.forEach(segment => {
        cameraCounts[segment.videoIndex] = (cameraCounts[segment.videoIndex] || 0) + 1;
      });
      
      const totalCameras = Object.keys(cameraCounts).length;
      console.log(`Found ${totalCameras} different camera angles`);
      
      // Distribute segments evenly across cameras
      let lastCameraIndex = -1;
      const minimumSegmentDuration = options.minSegmentDuration || 1.5;
      
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        
        // Skip segments that are too short
        if (segment.duration < minimumSegmentDuration) continue;
        
        // Try to alternate cameras, with a bias towards more important segments
        if (lastCameraIndex === segment.videoIndex) {
          // Reduce importance slightly to favor camera switches
          segment.importance *= 0.95;
        }
        
        if (totalDurationSelected + segment.duration <= effectiveDurationLimit) {
          selectedSegments.push(segment);
          totalDurationSelected += segment.duration;
          lastCameraIndex = segment.videoIndex;
        }
      }
    } else {
      // Standard segment selection
      for (const segment of segments) {
        if (totalDurationSelected + segment.duration <= effectiveDurationLimit) {
          selectedSegments.push(segment);
          totalDurationSelected += segment.duration;
        }
      }
    }
    
    // Sort segments by position in the final video
    selectedSegments.sort((a, b) => {
      if (a.timePosition !== undefined && b.timePosition !== undefined) {
        return a.timePosition - b.timePosition;
      }
      return 0;
    });
    
    console.log(`Selected ${selectedSegments.length} segments with total duration: ${totalDurationSelected.toFixed(1)}s`);
    
    // Process the segments into a final video
    return this.processSegmentsSequentially(videos, selectedSegments, options, onProgress);
  }

  /**
   * Process video segments into a final video file
   */
  private async processSegmentsSequentially(
    videos: HTMLVideoElement[],
    segments: VideoSegment[],
    options: ProcessingOptions,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (segments.length === 0) {
      console.warn('No segments selected, returning first video');
      return await this.videoToBlob(videos[0]);
    }
    
    console.log(`Processing ${segments.length} segments sequentially`);
    
    // For multicam mode, create a more accurate merged audio track
    let mergedAudioContext: AudioContext | null = null;
    let mergedDestination: MediaStreamAudioDestinationNode | null = null;
    
    if (options.multicamMode && options.syncAudio && videos.length > 1) {
      try {
        console.log('Setting up audio mixing for multicam mode');
        mergedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        mergedDestination = mergedAudioContext.createMediaStreamDestination();
      } catch (error) {
        console.error('Error setting up audio context:', error);
      }
    }
    
    // Prepare the canvas for the final video
    this.setupCanvasDimensions(videos[0], options.outputFormat);
    
    // Create the recorder
    const stream = this.canvas.captureStream();
    
    // Add audio track if needed
    if (options.syncAudio) {
      if (mergedDestination && mergedAudioContext) {
        // Use our merged audio for multicam mode
        stream.addTrack(mergedDestination.stream.getAudioTracks()[0]);
      } else {
        // Use audio from the first video for standard mode
        const audioTracks = this.getAudioTracks(videos);
        if (audioTracks.length > 0) {
          stream.addTrack(audioTracks[0]);
        }
      }
    }
    
    // Set MIME type based on browser support and quality
    let mimeType = 'video/webm;codecs=vp9';
    if (options.quality === 'low') {
      mimeType = 'video/webm;codecs=vp8';
    }
    
    // Setup MediaRecorder
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: this.getBitrate(options.quality)
    });
    
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };
    
    // Start recording
    recorder.start();
    
    // Process each segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const video = videos[segment.videoIndex] as EnhancedVideoElement;
      
      // Calculate progress percentage
      const progress = 40 + (i / segments.length) * 50;
      if (onProgress) onProgress(progress);
      
      console.log(`Processing segment ${i+1}/${segments.length}: video ${segment.videoIndex + 1}, ${segment.duration.toFixed(1)}s`);
      
      // Seek to the segment start time
      video.currentTime = segment.startTime;
      
      // Wait for the video to be ready at that position
      await new Promise<void>((resolve) => {
        const checkTime = () => {
          if (Math.abs(video.currentTime - segment.startTime) < 0.1) {
            resolve();
          } else {
            video.currentTime = segment.startTime;
            setTimeout(checkTime, 50);
          }
        };
        checkTime();
      });
      
      // Handle audio connections for this segment
      if (mergedAudioContext && mergedDestination && options.syncAudio) {
        try {
          // Create source for this video's audio
          const source = mergedAudioContext.createMediaElementSource(video);
          const gainNode = mergedAudioContext.createGain();
          
          // Apply fade-in at segment start for smooth audio
          gainNode.gain.setValueAtTime(0, mergedAudioContext.currentTime);
          gainNode.gain.linearRampToValueAtTime(1, mergedAudioContext.currentTime + 0.2);
          
          // Connect through gain node to destination
          source.connect(gainNode);
          gainNode.connect(mergedDestination);
          
          // Clean up when segment ends
          setTimeout(() => {
            try {
              // Apply fade-out at segment end
              gainNode.gain.linearRampToValueAtTime(0, mergedAudioContext.currentTime + 0.2);
              setTimeout(() => {
                try {
                  source.disconnect();
                  gainNode.disconnect();
                } catch (e) {
                  console.error('Error disconnecting audio nodes:', e);
                }
              }, 250);
            } catch (e) {
              console.error('Error applying audio fade-out:', e);
            }
          }, (segment.duration * 1000) - 250);
        } catch (error) {
          console.error('Error setting up audio for segment:', error);
        }
      }
      
      // Play the video segment
      try {
        video.play();
      } catch (error) {
        console.error('Error playing video segment:', error);
      }
      
      // Draw frames for the duration of the segment
      const startTime = performance.now();
      const segmentDuration = segment.duration * 1000; // Convert to milliseconds
      
      // Apply transition if this is not the first segment
      const isFirstSegment = i === 0;
      const isLastSegment = i === segments.length - 1;
      
      // Handle transitions based on transition type
      if (!isFirstSegment && options.transitionType === 'fade') {
        await this.applyTransition(videos, segments[i-1], segment, options);
      } else if (!isFirstSegment && options.transitionType === 'hard') {
        // For hard cuts, we just directly draw the new frame
        this.drawVideoFrame(video);
      }
      
      // For the main segment, regularly draw frames
      await this.drawSegmentFrames(
        video, 
        segmentDuration, 
        startTime, 
        options
      );
      
      // Apply outgoing transition if needed
      if (!isLastSegment && options.transitionType === 'fade') {
        await this.applyTransitionOut(video, segments[i+1], videos, options);
      }
      
      // Pause the video after the segment is done
      try {
        video.pause();
      } catch (error) {
        console.error('Error pausing video:', error);
      }
    }
    
    // Stop recording
    recorder.stop();
    
    // Wait for the last chunk
    return new Promise((resolve, reject) => {
      let timeoutId: number;
      
      const handleStop = () => {
        clearTimeout(timeoutId);
        
        if (onProgress) onProgress(99);
        
        // Clean up audio context
        if (mergedAudioContext) {
          mergedAudioContext.close().catch(e => console.error('Error closing audio context:', e));
        }
        
        if (chunks.length === 0) {
          console.error('No data was recorded');
          reject(new Error('No video data was recorded'));
          return;
        }
        
        const blob = new Blob(chunks, { type: mimeType });
        console.log(`Created final video: ${(blob.size / (1024 * 1024)).toFixed(2)} MB`);
        
        if (onProgress) onProgress(100);
        resolve(blob);
      };
      
      recorder.onstop = handleStop;
      
      // Set a timeout in case the recorder hangs
      timeoutId = window.setTimeout(() => {
        console.warn('MediaRecorder timed out, forcing stop');
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, 30000); // 30 second timeout
    });
  }

  /**
   * Process a single video
   */
  private async processSingleVideo(
    video: File, 
    options: ProcessingOptions,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (onProgress) onProgress(15);
    
    try {
      const videoElement = await this.loadVideo(video);
      
      if (onProgress) onProgress(30);
      
      // Set up canvas dimensions based on output format
      this.setupCanvasDimensions(videoElement, options.outputFormat);
      
      if (onProgress) onProgress(40);
      
      // For full-length option, use the entire video duration
      const isFullLength = !options.maxOutputDuration;
      const videoDuration = videoElement.duration;
      const duration = isFullLength ? videoDuration : Math.min(videoDuration, options.maxOutputDuration || 60);
      
      console.log(`Processing single video. Full length: ${isFullLength}, Duration: ${duration}s`);
      
      // Process the video with trimming
      const result = await this.processSingleVideoWithTrimming(
        videoElement, 
        options,
        duration,
        (progressPercent) => {
          // Map 0-100% to 40-95%
          if (onProgress) onProgress(40 + Math.floor(progressPercent * 0.55));
        }
      );
      
      // Clean up video element
      videoElement.pause();
      videoElement.removeAttribute('src');
      videoElement.load();
      
      if (onProgress) onProgress(95);
      
      return result;
    } catch (error) {
      console.error('Error in processSingleVideo:', error);
      throw error;
    }
  }

  /**
   * Load a video file into an HTMLVideoElement
   */
  private loadVideo(file: File): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      // First, check if the file is actually a video
      if (!file.type.startsWith('video/')) {
        console.warn(`File ${file.name} is not a recognized video format (${file.type})`);
        // Still attempt to load, but log a warning
      }
      
      console.log(`Loading video file: ${file.name}, type: ${file.type}, size: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      
      const video = document.createElement('video');
      
      // Important properties for proper playback
      video.muted = true;        // Mute to avoid audio playing during processing
      video.autoplay = false;    // Don't auto-play
      video.loop = false;        // Critical: ensure loop is OFF to prevent looping
      video.preload = 'auto';    // Preload the entire video
      video.playsInline = true;  // Play inline to avoid fullscreen on mobile
      
      // Create URL from the file
      const objectUrl = URL.createObjectURL(file);
      
      // Set up event listeners
      video.addEventListener('loadedmetadata', () => {
        console.log(`Video loaded with dimensions: ${video.videoWidth}x${video.videoHeight}, duration: ${video.duration}s`);
        
        // Additional check to ensure loop is disabled
        if (video.loop) {
          console.warn('Loop was somehow enabled, disabling it');
          video.loop = false;
        }
      });
      
      // Listen for all possible error events
      const errorHandler = (event: Event | ErrorEvent) => {
        const errorEvent = event as ErrorEvent;
        const videoEvent = event as Event;
        const videoTarget = videoEvent.target as HTMLVideoElement;
        
        let errorMessage = 'Unknown video error';
        if (errorEvent.message) {
          errorMessage = errorEvent.message;
        } else if (videoTarget && videoTarget.error) {
          // Check the MediaError code
          switch (videoTarget.error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              errorMessage = 'Video loading aborted';
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              errorMessage = 'Network error while loading video';
              break;
            case MediaError.MEDIA_ERR_DECODE:
              errorMessage = 'Video decode error - the format may not be supported';
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              errorMessage = 'Video format not supported by this browser';
              break;
          }
        }
        
        URL.revokeObjectURL(objectUrl);
        console.error(`Video loading error: ${errorMessage}`);
        reject(new Error(`Failed to load video: ${errorMessage}`));
      };
      
      video.addEventListener('error', errorHandler);
      
      // Revoke the object URL when we're done with it
      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
      };
      
      // Set up a timeout in case the video never loads
      const timeout = setTimeout(() => {
        cleanup();
        console.error(`Video loading timed out: ${file.name}`);
        reject(new Error('Video loading timed out after 15 seconds'));
      }, 15000);
      
      video.addEventListener('canplaythrough', () => {
        console.log(`Video is ready to play through without buffering: ${file.name}`);
        clearTimeout(timeout);
        
        // Verify again that looping is disabled
        video.loop = false;
        
        // Make sure video is fully loaded by seeking to a small time offset
        // This helps with some MP4 files that might have incomplete metadata
        const initialSeekHandler = () => {
          video.removeEventListener('seeked', initialSeekHandler);
          
          // Additional test: try to play it briefly to ensure it works
          const originalTime = video.currentTime;
          video.play().then(() => {
            // Successfully played
            setTimeout(() => {
              video.pause();
              // Return to original position
              video.currentTime = originalTime;
              resolve(video);
            }, 100); // Play for just 100ms to verify
          }).catch(playError => {
            console.warn(`Play test failed: ${playError.message}`);
            // Still resolve since metadata loaded
            resolve(video);
          });
        };
        
        video.addEventListener('seeked', initialSeekHandler);
        video.currentTime = 0.1; // Seek to 100ms
      });
      
      // Clear timeout if we get an error too
      video.addEventListener('error', () => {
        clearTimeout(timeout);
      }, { once: true });
      
      // Start loading the video
      video.src = objectUrl;
      video.load();
    });
  }

  /**
   * Set up canvas dimensions based on the output format
   */
  private setupCanvasDimensions(
    video: HTMLVideoElement, 
    format: 'vertical' | 'horizontal' | 'square'
  ) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    
    switch (format) {
      case 'vertical':
        this.canvas.width = 720;
        this.canvas.height = 1280;
        break;
      case 'horizontal':
        this.canvas.width = 1280;
        this.canvas.height = 720;
        break;
      case 'square':
        this.canvas.width = 1080;
        this.canvas.height = 1080;
        break;
    }
    
    // Set the same dimensions for offscreen canvas
    this.offscreenCanvas.width = this.canvas.width;
    this.offscreenCanvas.height = this.canvas.height;
    
    console.log(`Canvas dimensions set to ${this.canvas.width}x${this.canvas.height}`);
  }

  /**
   * Process a single video with trimming based on options
   */
  private processSingleVideoWithTrimming(
    video: HTMLVideoElement,
    options: ProcessingOptions,
    duration: number, // Accept explicit duration parameter
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('Processing single video with trimming');
        if (onProgress) onProgress(10);
        
        // Set quality based on options
        const quality = options.quality === 'high' ? 0.9 : 
                        options.quality === 'medium' ? 0.7 : 0.5;
        
        console.log(`Using quality setting: ${quality}`);
        
        // Set up canvas dimensions based on output format
        this.setupCanvasDimensions(video, options.outputFormat);
        
        // Define the output format
        const mimeType = 'video/webm';
        
        // Generate MediaRecorder options based on quality
        const recorderOptions = {
          mimeType,
          videoBitsPerSecond: options.quality === 'high' ? 8000000 : 
                              options.quality === 'medium' ? 4000000 : 2000000
        };
        
        console.log('Recorder options:', recorderOptions);
        
        if (onProgress) onProgress(20);
        
        // Create a MediaRecorder
        const stream = this.canvas.captureStream(30);
        
        // Add audio from the video if available and syncAudio is enabled
        if (options.syncAudio) {
          try {
            const enhancedVideo = video as EnhancedVideoElement;
            const videoStream = enhancedVideo.captureStream ? enhancedVideo.captureStream() : 
                               enhancedVideo.mozCaptureStream ? enhancedVideo.mozCaptureStream() : null;
            
            if (videoStream) {
              const audioTracks = videoStream.getAudioTracks();
              if (audioTracks.length > 0) {
                stream.addTrack(audioTracks[0]);
                console.log('Added audio track from video');
              }
            }
          } catch (e) {
            console.warn('Error adding audio track:', e);
          }
        }
        
        const recorder = new MediaRecorder(stream, recorderOptions);
        
        let chunks: Blob[] = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        
        recorder.onstop = () => {
          try {
            const blob = new Blob(chunks, { type: mimeType });
            console.log(`Recording complete: ${blob.size} bytes`);
            resolve(blob);
          } catch (error) {
            console.error('Error creating blob:', error);
            reject(error);
          }
        };
        
        if (onProgress) onProgress(30);
        
        // Start recording
        recorder.start();
        
        // Start playback and frame capture
        video.currentTime = 0;
        video.play();
        
        // Keep track of elapsed time
        let startTime = Date.now();
        let elapsedTime = 0;
        
        // Function to draw the current frame
        const drawFrame = () => {
          // Calculate the best fit for the video in the canvas
          const scale = Math.min(
            this.canvas.width / video.videoWidth,
            this.canvas.height / video.videoHeight
          );
          
          // Calculate centered position
          const x = (this.canvas.width - video.videoWidth * scale) / 2;
          const y = (this.canvas.height - video.videoHeight * scale) / 2;
          
          // Clear canvas
          this.ctx.fillStyle = 'black';
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
          
          // Draw video frame
          this.ctx.drawImage(
            video,
            0, 0, video.videoWidth, video.videoHeight,
            x, y, video.videoWidth * scale, video.videoHeight * scale
          );
          
          // Update elapsed time
          elapsedTime = (Date.now() - startTime) / 1000;
          
          // Update progress based on video time
          if (onProgress) {
            const progressPercent = Math.min(100, (video.currentTime / duration) * 100);
            onProgress(progressPercent);
          }
          
          // Continue animation if video is still playing
          if (video.ended || video.paused) {
            console.log('Video ended or paused, stopping recorder');
            recorder.stop();
            return;
          }
          
          // Check if we've reached maximum duration
          if (elapsedTime >= duration) {
            console.log(`Reached specified duration (${duration}s), stopping recorder`);
            recorder.stop();
            video.pause();
            return;
          }
          
          // Continue animation
          requestAnimationFrame(drawFrame);
        };
        
        // Start animation
        drawFrame();
      } catch (error) {
        console.error('Error in processSingleVideoWithTrimming:', error);
        reject(error);
      }
    });
  }

  /**
   * Calculate the importance of a frame for segment selection
   */
  private calculateFrameImportance(imageData: ImageData, lastImportance: number): number {
    const { data, width, height } = imageData;
    let brightness = 0;
    let contrast = 0;
    let prevY = 0;
    
    // Sample the frame (analyze every 10th pixel for performance)
    const sampleInterval = 10;
    let sampleCount = 0;
    
    // Calculate brightness and estimate contrast
    for (let y = 0; y < height; y += sampleInterval) {
      for (let x = 0; x < width; x += sampleInterval) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Convert RGB to luminance
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        brightness += luminance;
        
        // Estimate contrast with neighboring pixels
        if (x > 0) {
          const prevI = (y * width + (x - sampleInterval)) * 4;
          const prevR = data[prevI];
          const prevG = data[prevI + 1];
          const prevB = data[prevI + 2];
          const prevLuminance = 0.299 * prevR + 0.587 * prevG + 0.114 * prevB;
          contrast += Math.abs(luminance - prevLuminance);
        }
        
        if (y > 0) {
          const prevI = ((y - sampleInterval) * width + x) * 4;
          const prevR = data[prevI];
          const prevG = data[prevI + 1];
          const prevB = data[prevI + 2];
          const prevLuminance = 0.299 * prevR + 0.587 * prevG + 0.114 * prevB;
          contrast += Math.abs(luminance - prevLuminance);
        }
        
        sampleCount++;
      }
    }
    
    // Calculate average brightness (0-255)
    brightness = brightness / sampleCount;
    
    // Normalize brightness to 0-1
    const normalizedBrightness = brightness / 255;
    
    // Normalize contrast (divide by number of comparisons and max possible diff)
    const maxContrastPerPixel = 255 * 2; // Max possible difference in horizontal and vertical directions
    const normalizedContrast = contrast / (sampleCount * 2 * maxContrastPerPixel);
    
    // Calculate change from last frame (temporal difference)
    const changeFactor = Math.min(1, Math.abs(normalizedBrightness - lastImportance) * 5);
    
    // Combine factors with weights
    const brightnessWeight = 0.2;
    const contrastWeight = 0.5;
    const changeWeight = 0.3;
    
    const importance = 
      normalizedBrightness * brightnessWeight + 
      normalizedContrast * contrastWeight + 
      changeFactor * changeWeight;
    
    return importance;
  }
  
  /**
   * Convert a video element to a blob as a fallback method
   */
  private videoToBlob(video: HTMLVideoElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        console.log('Converting video element to blob as fallback');
        
        // Set up canvas with video dimensions
        this.canvas.width = video.videoWidth;
        this.canvas.height = video.videoHeight;
        
        // Try different mime types
        let mimeType = '';
        for (const type of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8', 'video/webm']) {
          if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }
        
        if (!mimeType) mimeType = 'video/webm';
        console.log(`Using mime type ${mimeType} for fallback recording`);
        
        // Create a stream from the canvas
        const stream = this.canvas.captureStream(30);
        
        // Add audio if available
        try {
          const enhancedVideo = video as EnhancedVideoElement;
          const videoStream = enhancedVideo.captureStream ? enhancedVideo.captureStream() : 
                             enhancedVideo.mozCaptureStream ? enhancedVideo.mozCaptureStream() : null;
          
          if (videoStream) {
            const audioTracks = videoStream.getAudioTracks();
            if (audioTracks.length > 0) {
              stream.addTrack(audioTracks[0]);
              console.log('Added audio track to fallback stream');
            }
          }
        } catch (e) {
          console.warn('Could not add audio to fallback recording:', e);
        }
        
        // Create a new recorder
        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks: Blob[] = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        
        recorder.onstop = () => {
          try {
            const blob = new Blob(chunks, { type: mimeType });
            console.log(`Fallback recording complete: ${blob.size} bytes`);
            resolve(blob);
          } catch (error) {
            reject(error);
          }
        };
        
        // Start recording
        recorder.start(1000);
        
        // Seek to beginning and play
        video.currentTime = 0;
        video.play().catch(e => console.warn('Error playing video:', e));
        
        // Record for the duration of the video plus a small buffer
        setTimeout(() => {
          video.pause();
          recorder.stop();
        }, (video.duration * 1000) + 1000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle audio transition between two video segments
   */
  private async handleAudioTransition(
    fromVideo: EnhancedVideoElement,
    toVideo: EnhancedVideoElement,
    crossfadeTime: number
  ): Promise<void> {
    if (!fromVideo.audioSource || !toVideo.audioSource) {
      console.log('Audio sources not available for transition');
      return;
    }

    try {
      console.log(`Applying audio transition between videos`);
      
      // Get the audio context (should be the same for both videos)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // For hard cuts, we'll still do a very short crossfade to avoid clicks/pops
      const quickFadeTime = 0.1; // 100ms crossfade to avoid audio pops
      
      // Find any connected gain nodes and apply quick crossfade
      if (fromVideo.audioSource && toVideo.audioSource) {
        // Create temporary gain nodes if needed
        const fromGain = audioContext.createGain();
        const toGain = audioContext.createGain();
        
        // Start with "from" at full volume and "to" at zero
        fromGain.gain.value = 1.0;
        toGain.gain.value = 0.0;
        
        // Schedule the quick crossfade
        const now = audioContext.currentTime;
        
        // Apply quick fade out/in
        fromGain.gain.setValueAtTime(1.0, now);
        fromGain.gain.linearRampToValueAtTime(0, now + quickFadeTime);
        
        toGain.gain.setValueAtTime(0, now);
        toGain.gain.linearRampToValueAtTime(1.0, now + quickFadeTime);
        
        console.log(`Quick audio transition scheduled`);
        
        // Wait for transition to complete
        await new Promise(resolve => setTimeout(resolve, quickFadeTime * 1000));
      }
    } catch (error) {
      console.warn('Error during audio transition:', error);
      // Continue processing even if audio transition fails
    }
  }

  /**
   * Process a segment of video for the specified duration
   */
  private processVideoSegment(
    video: HTMLVideoElement,
    duration: number
  ): Promise<void> {
    return new Promise((resolve) => {
      // Set video to the start
      video.currentTime = 0;
      
      // Start playback
      video.play();
      
      // Keep track of elapsed time
      const startTime = Date.now();
      let animationFrameId: number;
      
      // Function to draw the current frame
      const drawFrame = () => {
        // Calculate the best fit for the video in the canvas
        const scale = Math.min(
          this.canvas.width / video.videoWidth,
          this.canvas.height / video.videoHeight
        );
        
        // Calculate centered position
        const x = (this.canvas.width - video.videoWidth * scale) / 2;
        const y = (this.canvas.height - video.videoHeight * scale) / 2;
        
        // Clear canvas
        this.ctx.fillStyle = 'black';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw video frame
        this.ctx.drawImage(
          video,
          0, 0, video.videoWidth, video.videoHeight,
          x, y, video.videoWidth * scale, video.videoHeight * scale
        );
        
        // Calculate elapsed time
        const elapsedTime = (Date.now() - startTime) / 1000;
        
        // Check if we've reached the end of the segment or video
        if (elapsedTime >= duration || video.ended || video.paused) {
          video.pause();
          cancelAnimationFrame(animationFrameId);
          resolve();
          return;
        }
        
        // Continue animation
        animationFrameId = requestAnimationFrame(drawFrame);
      };
      
      // Start animation
      animationFrameId = requestAnimationFrame(drawFrame);
    });
  }

  /**
   * Set up synchronized audio from multiple video sources
   * This creates a continuous audio stream across all videos
   */
  private async setupSynchronizedAudio(
    videos: HTMLVideoElement[],
    outputStream: MediaStream,
    options: ProcessingOptions
  ): Promise<void> {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a main audio destination to collect all processed audio
    const mainDestination = audioContext.createMediaStreamDestination();
    
    // Array to track all created nodes for cleanup
    const audioNodes: AudioNode[] = [];
    
    try {
      console.log(`Setting up synchronized audio for ${videos.length} videos`);
      
      // Process each video to extract and connect its audio
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i] as EnhancedVideoElement;
        
        // Skip if no audio tracks
        const videoStream = video.captureStream ? video.captureStream() : 
                           video.mozCaptureStream ? video.mozCaptureStream() : null;
        
        if (!videoStream) {
          console.log(`Video ${i}: No capture stream available`);
          continue;
        }
        
        const audioTracks = videoStream.getAudioTracks();
        if (!audioTracks.length) {
          console.log(`Video ${i}: No audio tracks available`);
          continue;
        }
        
        // Store the audio track with the video
        video.audioTrack = audioTracks[0];
        
        // Create audio source from the media stream
        const audioStream = new MediaStream([audioTracks[0]]);
        const source = audioContext.createMediaStreamSource(audioStream);
        video.audioSource = source;
        audioNodes.push(source);
        
        // Create gain node for volume control and crossfading
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        source.connect(gainNode);
        audioNodes.push(gainNode);
        
        // Add audio processing if needed (EQ, compression, etc.)
        if (options.blendAudio) {
          // Add a compressor to even out audio levels
          const compressor = audioContext.createDynamicsCompressor();
          compressor.threshold.value = -24;
          compressor.knee.value = 30;
          compressor.ratio.value = 12;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.25;
          gainNode.connect(compressor);
          compressor.connect(mainDestination);
          audioNodes.push(compressor);
        } else {
          // Direct connection without additional processing
          gainNode.connect(mainDestination);
        }
        
        console.log(`Added audio processing chain for video ${i}`);
      }
      
      // Add the combined audio track to the output stream
      const audioTracks = mainDestination.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        outputStream.addTrack(audioTracks[0]);
        console.log('Added synchronized audio track to output stream');
      }
    } catch (error) {
      console.error('Error setting up synchronized audio:', error);
      // Clean up audio nodes
      audioNodes.forEach(node => {
        try {
          node.disconnect();
        } catch (e) {
          console.warn('Error disconnecting audio node:', e);
        }
      });
      throw error;
    }
  }
  
  /**
   * Fallback to default audio handling if synchronized setup fails
   */
  private setupDefaultAudio(videos: HTMLVideoElement[], outputStream: MediaStream): void {
    console.log('Using default audio setup for videos');
    const audioTracks: MediaStreamTrack[] = [];
    
    // Try to get audio tracks from videos
    for (const video of videos) {
      const enhancedVideo = video as EnhancedVideoElement;
      if (enhancedVideo.mozCaptureStream) {
        const videoStream = enhancedVideo.mozCaptureStream();
        const audioTrack = videoStream.getAudioTracks()[0];
        if (audioTrack) audioTracks.push(audioTrack);
      } else if (enhancedVideo.captureStream) {
        const videoStream = enhancedVideo.captureStream();
        const audioTrack = videoStream.getAudioTracks()[0];
        if (audioTrack) audioTracks.push(audioTrack);
      }
    }
    
    // Add audio tracks to stream if available
    if (audioTracks.length > 0) {
      audioTracks.forEach(track => outputStream.addTrack(track));
      console.log(`Added ${audioTracks.length} audio tracks to stream`);
    } else {
      console.log('No audio tracks available from videos');
    }
  }

  /**
   * Apply a transition effect from previous frame to this video
   * Uses the appropriate transition type based on settings
   */
  private applyTransition(
    video: HTMLVideoElement,
    transitionDuration: number
  ): Promise<void> {
    return this.applyHardTransition(video, transitionDuration);
  }

  /**
   * Apply a transition effect from this video to next
   * Uses the appropriate transition type based on settings
   */
  private applyTransitionOut(
    video: HTMLVideoElement,
    transitionDuration: number
  ): Promise<void> {
    return this.applyHardTransitionOut(video, transitionDuration);
  }
} 