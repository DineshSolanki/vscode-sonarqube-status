# Changelog

## [2.0.0] - (2025-02-18)

### Added
- New VS Code settings configuration option with highest priority
  - `sonarqubeStatus.project`: SonarQube project key
  - `sonarqubeStatus.sonarURL`: SonarQube server URL
  - `sonarqubeStatus.token`: SonarQube authentication token
- Settings button in activity bar for quick access to configuration
- Enhanced configuration priority system:
  1. VS Code Settings (highest)
  2. project.json (middle)
  3. Environment Variables (lowest)
- Better error logging and debugging with dedicated output channel
- Workspace state management to track configuration sources
- Support for Windows paths in configuration files

### Changed
- Simplified authentication to token-based only (removed username/password as deprecated by Sonarqube)
- Improved path handling using VS Code's URI system
- Better error messages with more context

### Fixed
- Windows path handling issues with .vscode directory

### Removed
- Username/password authentication option (use token authentication instead)
