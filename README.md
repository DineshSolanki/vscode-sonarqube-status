# SonarQube Project Status Plus

This extension is a maintained fork of [SonarQube Project Status](https://github.com/adisreyaj/vscode-sonarqube-status) originally created by [Adithya Sreyaj](https://github.com/adisreyaj).

## Why this fork?

The original project has been inactive since 2022 with several pending issues and pull requests. This fork aims to:
- Maintain active development and support
- Fix existing bugs and issues
- Add new features and improvements
- Provide timely responses to community contributions

## Recent Improvements
See the [CHANGELOG](CHANGELOG.md) for a detailed list of changes.

- Fixed SonarQube API integration issues
- Added better error logging and debugging
- Updated dependencies to latest versions
- Improved TypeScript type safety
- Added modern VS Code features support

## Features

1. Status bar item for quick Quality Gate Status visibility
   ![Sonarqube passed](images/sonar-passed.png)
   ![Sonarqube failed](images/sonar-failed.png)

2. Detailed metrics in the dedicated SonarQube section
   ![Sonarqube Full Result](images/sonar-full-details.png)

3. Quick refresh button to update results

## Setup

1. Install the extension
2. Click on the SonarQube logo in the activity bar or run the command:
   ```
   SonarQube: Get Report
   ```
3. Configure SonarQube settings using one of the following methods:

### Using VS Code Settings (Highest Priority)

1. Open VS Code Settings (File > Preferences > Settings)
2. Search for "SonarQube Status"
3. Configure the following settings:
   - `sonarqubeStatus.project`: Your SonarQube project key
   - `sonarqubeStatus.sonarURL`: Your SonarQube server URL
   - `sonarqubeStatus.token`: Your SonarQube authentication token

Alternatively, you can add these settings in your `settings.json`:
```json
{
  "sonarqubeStatus.project": "your_project_key",
  "sonarqubeStatus.sonarURL": "https://your.sonarqube.url",
  "sonarqubeStatus.token": "your_token"
}
```

### Using project.json Configuration (Second Priority)

Create `.vscode/project.json` with your configuration:

```json
{
  "project": "your_project_key",
  "sonarURL": "https://your.sonarqube.url",
  "token": "your_token"
}
```

### Using Environment Variables (Fallback)

Set the following environment variables:
```bash
SONAR_HOST_URL=https://your.sonarqube.url
SONAR_TOKEN=your_token
```

**Configuration Priority**:
1. VS Code Settings (Highest)
2. project.json
3. Environment Variables (Lowest)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Install the extension locally
npm run install-extension
```

## Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## License
This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments
- Original author: [Adithya Sreyaj](https://github.com/adisreyaj)
- Original project: [vscode-sonarqube-status](https://github.com/adisreyaj/vscode-sonarqube-status)
