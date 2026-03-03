# Studio Video Editor

A modern web-based video editing tool built with React and TypeScript. This application allows users to edit and combine multiple video clips with features like multicam support, audio synchronization, and various transition effects.

## Features

- 🎥 Multiple video upload support
- 📱 Multiple output formats (Vertical, Horizontal, Square)
- 🎬 Smart scene detection and cutting
- 🔊 Audio synchronization for multicam editing
- 🎨 Customizable transitions (Hard cuts or Fades)
- ⚡ Adjustable processing speed and quality settings
- 🎵 Advanced audio controls with blending options
- ⏱️ Flexible output duration control

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone [your-repository-url]
cd studio-video-editor
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at http://localhost:5173

## Usage

1. Upload one or more video files by dragging and dropping them into the upload area
2. Configure your desired output settings:
   - Choose output format (Vertical/Horizontal/Square)
   - Set quality level
   - Adjust processing speed
   - Configure cut scene frequency
   - Enable/disable audio features
3. Click "Process Videos" to start editing
4. Download the processed video when complete

## Technology Stack

- React
- TypeScript
- Vite
- Web APIs:
  - MediaRecorder
  - Canvas
  - Web Audio API
  - MediaStream

## License

This project is licensed under the MIT License - see the LICENSE file for details. 

## Team Operations
- Use `docs/DEPLOY_CHECKLIST.md` before release.
- Use `docs/HANDOFF_CHECKLIST.md` for onboarding.

## Employment Readiness
This repository includes baseline standards to support hiring and delegation:
- Clear onboarding in README/docs
- CI checks for build/test/lint where applicable
- Handoff/deploy checklist for repeatable operations
- Secret-safe configuration via `.env.example` or platform secrets

