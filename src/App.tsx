import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Video, Clapperboard, Upload, Settings, X, Smartphone, Download, Check, Music, Volume2, Play, Activity, Scissors, Zap, Film, Clock, Camera } from 'lucide-react';
import { SimpleVideoProcessor, ProcessingOptions } from './SimpleVideoProcessor';
import './App.css';

// Define types for processor options
interface VideoFile extends File {
  preview?: string;
}

function App() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [processor, setProcessor] = useState<SimpleVideoProcessor | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [options, setOptions] = useState<ProcessingOptions>({
    minSegmentDuration: 1.5,
    maxSegmentDuration: 4,
    transitionDuration: 0.5,
    outputFormat: 'horizontal',
    quality: 'medium',
    maxOutputDuration: undefined,
    syncAudio: true,
    cutFrequency: 'medium',
    blendAudio: false,
    processingSpeed: 'balanced',
    audioSmoothingTime: 0.8,
    transitionType: 'hard',
    multicamMode: false
  });

  // Initialize video processor on component mount
  useEffect(() => {
    const init = async () => {
      const simpleProcessor = new SimpleVideoProcessor();
      await simpleProcessor.init();
      setProcessor(simpleProcessor);
    };
    init();
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles.map(file => Object.assign(file, {
      preview: URL.createObjectURL(file)
    })));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi']
    },
    multiple: true
  });

  const handleClear = () => {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
    }
    // Also revoke previews
    files.forEach(file => {
      if (file.preview) URL.revokeObjectURL(file.preview);
    });
    setFiles([]);
    setDownloadUrl('');
    setProgress(0);
  };

  // Process videos with progress tracking
  const handleProcess = async () => {
    if (!processor || files.length === 0) return;
    
    try {
      setProcessing(true);
      setProgress(0);
      setDownloadUrl('');

      // Function to track progress
      const onProgress = (progress: number) => {
        console.log(`Processing progress: ${progress}%`);
        setProgress(Math.round(progress));
      };

      // Run video processing
      const result = await processor.processVideos(files, options, onProgress);
      
      console.log('Processing complete!', result);
      
      // Create download URL
      const downloadUrl = URL.createObjectURL(result);
      setDownloadUrl(downloadUrl);
    } catch (error) {
      console.error('Error processing videos:', error);
      const errorMessage = error instanceof Error
        ? `Error: ${error.message}`
        : 'Unknown error processing videos';
      alert(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  const removeFile = (index: number) => {
    const fileToRemove = files[index];
    if (fileToRemove.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleFormatChange = (format: 'vertical' | 'horizontal' | 'square') => {
    setOptions(prev => ({
      ...prev,
      outputFormat: format
    }));
  };

  const handleQualityChange = (quality: 'high' | 'medium' | 'low') => {
    setOptions(prev => ({
      ...prev,
      quality
    }));
  };

  const handleProcessingSpeedChange = (processingSpeed: 'balanced' | 'fast' | 'ultrafast') => {
    setOptions(prev => ({
      ...prev,
      processingSpeed
    }));
  };

  const handleCutFrequencyChange = (cutFrequency: 'low' | 'medium' | 'high') => {
    setOptions(prev => ({
      ...prev,
      cutFrequency
    }));
  };

  const handleSyncAudioChange = (syncAudio: boolean) => {
    setOptions(prev => ({
      ...prev,
      syncAudio
    }));
  };

  const handleBlendAudioChange = (blendAudio: boolean) => {
    setOptions(prev => ({
      ...prev,
      blendAudio
    }));
  };

  const handleTransitionTypeChange = (transitionType: 'hard' | 'fade') => {
    setOptions(prev => ({
      ...prev,
      transitionType
    }));
  };

  const handleMulticamModeChange = (multicamMode: boolean) => {
    setOptions(prev => ({
      ...prev,
      multicamMode
    }));
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <Clapperboard className="logo-icon" />
        <h1>Studio Video Editor</h1>
        <button 
          className="settings-toggle" 
          onClick={() => setShowSettings(!showSettings)}
          title="Toggle Settings"
        >
          <Settings size={20} />
        </button>
      </header>
      
      <main className="main-content">
        {/* Dropzone Upload Area */}
        <div className="upload-container">
          <div {...getRootProps({ className: `dropzone ${isDragActive ? 'active' : ''}` })}>
            <input {...getInputProps()} disabled={processing} />
            <Upload size={48} className="upload-icon" />
            <p className="upload-text">
              {isDragActive 
                ? "Drop videos here..." 
                : "Drag & drop videos here, or click to select"}
            </p>
            <p className="upload-help">
              Supports MP4, MOV, WebM
            </p>
          </div>
          
          {files.length > 0 && (
            <button 
              className="clear-button"
              onClick={handleClear}
              disabled={processing}
            >
              <X size={16} /> Clear All
            </button>
          )}
        </div>
      
        {/* File List */}
        {files.length > 0 && (
          <div className="file-list-container">
            <h2 className="section-title">
              <Video size={20} />
              Selected Videos
            </h2>
            <ul className="file-list">
              {files.map((file, index) => (
                <li key={index} className="file-item">
                  <div className="file-info">
                    <span className="file-name">{file.name}</span>
                    <span className="file-size">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <button 
                    className="remove-button"
                    onClick={() => removeFile(index)}
                    disabled={processing}
                    title="Remove file"
                  >
                    <X size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Settings Panel - Toggled by the settings button */}
        <div className={`settings-panel ${showSettings ? 'open' : ''}`}>
          <div className="settings-header">
            <h2 className="section-title">
              <Settings size={20} />
              Settings
            </h2>
          </div>
          
          <div className="settings-content">
            <div className="setting-group">
              <label className="setting-label">Output Format</label>
              <div className="button-group">
                <button 
                  className={options.outputFormat === 'vertical' ? 'selected' : ''}
                  onClick={() => handleFormatChange('vertical')}
                  disabled={processing}
                >
                  <Smartphone size={16} />
                  Vertical
                </button>
                <button 
                  className={options.outputFormat === 'horizontal' ? 'selected' : ''}
                  onClick={() => handleFormatChange('horizontal')}
                  disabled={processing}
                >
                  <Video size={16} />
                  Horizontal
                </button>
                <button 
                  className={options.outputFormat === 'square' ? 'selected' : ''}
                  onClick={() => handleFormatChange('square')}
                  disabled={processing}
                >
                  <div className="square-icon" />
                  Square
                </button>
              </div>
            </div>
            
            <div className="setting-group">
              <label className="setting-label">Quality</label>
              <div className="button-group">
                <button 
                  className={options.quality === 'low' ? 'selected' : ''}
                  onClick={() => handleQualityChange('low')}
                  disabled={processing}
                >
                  Low
                </button>
                <button 
                  className={options.quality === 'medium' ? 'selected' : ''}
                  onClick={() => handleQualityChange('medium')}
                  disabled={processing}
                >
                  Medium
                </button>
                <button 
                  className={options.quality === 'high' ? 'selected' : ''}
                  onClick={() => handleQualityChange('high')}
                  disabled={processing}
                >
                  High
                </button>
              </div>
            </div>
            
            <div className="setting-group">
              <label className="setting-label">Processing Speed</label>
              <div className="button-group">
                <button 
                  className={options.processingSpeed === 'balanced' ? 'selected' : ''}
                  onClick={() => handleProcessingSpeedChange('balanced')}
                  disabled={processing}
                >
                  Balanced
                </button>
                <button 
                  className={options.processingSpeed === 'fast' ? 'selected' : ''}
                  onClick={() => handleProcessingSpeedChange('fast')}
                  disabled={processing}
                >
                  Fast
                </button>
                <button 
                  className={options.processingSpeed === 'ultrafast' ? 'selected' : ''}
                  onClick={() => handleProcessingSpeedChange('ultrafast')}
                  disabled={processing}
                >
                  Ultra Fast
                </button>
              </div>
            </div>
            
            <div className="setting-group">
              <label className="setting-label">Cut Scene Frequency</label>
              <div className="button-group">
                <button 
                  className={options.cutFrequency === 'low' ? 'selected' : ''}
                  onClick={() => handleCutFrequencyChange('low')}
                  disabled={processing}
                >
                  <div className="cut-indicator">
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                  </div>
                  Low
                </button>
                <button 
                  className={options.cutFrequency === 'medium' ? 'selected' : ''}
                  onClick={() => handleCutFrequencyChange('medium')}
                  disabled={processing}
                >
                  <div className="cut-indicator">
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                  </div>
                  Medium
                </button>
                <button 
                  className={options.cutFrequency === 'high' ? 'selected' : ''}
                  onClick={() => handleCutFrequencyChange('high')}
                  disabled={processing}
                >
                  <div className="cut-indicator">
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                    <span className="cut-dot"></span>
                  </div>
                  High
                </button>
              </div>
              <p className="setting-description">Controls how many cut scenes are included in the final video</p>
            </div>
            
            <div className="setting-group">
              <label className="setting-label">Audio Options</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.syncAudio}
                    onChange={(e) => handleSyncAudioChange(e.target.checked)}
                    disabled={processing}
                  />
                  <span className="checkbox-text">Include Audio</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={options.blendAudio}
                    onChange={(e) => handleBlendAudioChange(e.target.checked)}
                    disabled={processing || !options.syncAudio}
                  />
                  <span className="checkbox-text">Auto-balance Audio</span>
                </label>
              </div>
            </div>
            
            {/* Audio Settings */}
            <div className="settings-section">
              <h3>Audio Settings</h3>
              <div className="setting-group">
                <div className="checkbox-setting">
                  <input
                    type="checkbox"
                    id="syncAudio"
                    checked={options.syncAudio}
                    onChange={(e) => setOptions({ ...options, syncAudio: e.target.checked })}
                  />
                  <label htmlFor="syncAudio">
                    <span>Synchronize Audio</span>
                    <small>Maintain continuous audio when switching between videos</small>
                  </label>
                </div>
              </div>
              
              <div className="setting-group">
                <div className="checkbox-setting">
                  <input
                    type="checkbox"
                    id="blendAudio"
                    checked={options.blendAudio}
                    onChange={(e) => setOptions({ ...options, blendAudio: e.target.checked })}
                  />
                  <label htmlFor="blendAudio">
                    <span>Blend Audio</span>
                    <small>Balance audio levels between clips</small>
                  </label>
                </div>
              </div>
              
              <div className="setting-group">
                <label>Audio Smoothing</label>
                <div className="slider-container">
                  <input 
                    type="range" 
                    min="0" 
                    max="2" 
                    step="0.1" 
                    value={options.audioSmoothingTime} 
                    onChange={(e) => setOptions({ 
                      ...options, 
                      audioSmoothingTime: parseFloat(e.target.value) 
                    })} 
                  />
                  <span>{options.audioSmoothingTime.toFixed(1)}s</span>
                  <small>Controls smoothness of audio transitions between clips</small>
                </div>
              </div>
            </div>
            
            {/* Maximum output duration setting section with full length option */}
            <div className="setting-group">
              <label className="setting-label">Maximum Output Duration</label>
              <div className="button-group">
                <button 
                  className={!options.maxOutputDuration ? 'selected' : ''}
                  onClick={() => setOptions({ ...options, maxOutputDuration: undefined })}
                  disabled={processing}
                >
                  Full Length
                </button>
                <button 
                  className={options.maxOutputDuration === 60 ? 'selected' : ''}
                  onClick={() => setOptions({ ...options, maxOutputDuration: 60 })}
                  disabled={processing}
                >
                  60s
                </button>
                <button 
                  className={options.maxOutputDuration === 120 ? 'selected' : ''}
                  onClick={() => setOptions({ ...options, maxOutputDuration: 120 })}
                  disabled={processing}
                >
                  2 min
                </button>
                <button 
                  className={options.maxOutputDuration === 300 ? 'selected' : ''}
                  onClick={() => setOptions({ ...options, maxOutputDuration: 300 })}
                  disabled={processing}
                >
                  5 min
                </button>
              </div>
              <p className="setting-description">Choose output video length (Full Length uses entire input duration)</p>
            </div>
            
            <div className="setting-group">
              <label className="setting-label">Segment Length</label>
              <div className="slider-container">
                <input 
                  type="range" 
                  min="1" 
                  max="15" 
                  step="1" 
                  value={options.maxSegmentDuration} 
                  onChange={(e) => setOptions({ 
                    ...options, 
                    maxSegmentDuration: parseInt(e.target.value),
                    minSegmentDuration: Math.min(parseInt(e.target.value) - 1, options.minSegmentDuration)
                  })} 
                />
                <span>Max {options.maxSegmentDuration} seconds</span>
              </div>
              <p className="setting-description">Maximum length of each video segment</p>
            </div>
            
            <div className="setting-group">
              <label className="setting-label">Transition Type</label>
              <div className="button-group">
                <button 
                  className={options.transitionType === 'hard' ? 'selected' : ''}
                  onClick={() => handleTransitionTypeChange('hard')}
                  disabled={processing}
                >
                  Hard Cut
                </button>
                <button 
                  className={options.transitionType === 'fade' ? 'selected' : ''}
                  onClick={() => handleTransitionTypeChange('fade')}
                  disabled={processing}
                >
                  Fade
                </button>
              </div>
              <p className="setting-description">Choose between immediate cuts or gradual fades between scenes</p>
            </div>
            
            <div className="settings-section">
              <div className="settings-label">
                <Camera size={16} />
                <span>MultiCam Mode</span>
              </div>
              <div className="settings-description">
                Use audio to synchronize multiple camera angles
              </div>
              <div className="settings-options">
                <button
                  className={options.multicamMode ? 'active' : ''}
                  onClick={() => handleMulticamModeChange(true)}
                >
                  <span>On</span>
                </button>
                <button
                  className={!options.multicamMode ? 'active' : ''}
                  onClick={() => handleMulticamModeChange(false)}
                >
                  <span>Off</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Processing Action */}
        <div className="action-section">
          <button 
            className="process-button"
            onClick={handleProcess}
            disabled={processing || files.length === 0}
          >
            {processing ? (
              <>
                <div className="spinner"></div> Processing...
              </>
            ) : (
              <>
                <Clapperboard size={20} /> Process Videos
              </>
            )}
          </button>
          
          {/* Progress indicator */}
          {processing && (
            <div className="progress-container">
              <div className="progress-bar" style={{ width: `${progress}%` }}></div>
              <span className="progress-text">{progress}%</span>
            </div>
          )}
        </div>
        
        {/* Download Section */}
        {downloadUrl && (
          <div className="download-section">
            <div className="success-banner">
              <Check size={24} className="success-icon" />
              <h2>Your Video is Ready!</h2>
            </div>
            
            <div className="video-player">
              <video controls src={downloadUrl} />
            </div>
            
            <div className="download-actions">
              <a 
                href={downloadUrl} 
                download={`studio-edit-${new Date().toISOString().slice(0, 10)}.webm`}
                className="download-button"
              >
                <Download size={20} /> Download Video
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;