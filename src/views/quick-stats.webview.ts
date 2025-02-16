import * as vscode from 'vscode';

export class SonarQuickStatsProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private lastUpdateTime?: number;

  constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'metricClick':
            const detail = this.getMetricDetail(message.metric);
            vscode.window.showInformationMessage(detail.title, ...detail.actions)
              .then(selection => {
                if (selection === 'Learn More') {
                  vscode.env.openExternal(vscode.Uri.parse(detail.learnMoreUrl));
                }
              });
            break;
        }
      },
      undefined,
      []
    );
  }

  private getMetricDetail(metric: string) {
    const details: Record<string, { title: string, actions: string[], learnMoreUrl: string }> = {
      'Bugs': {
        title: 'Bugs represent coding mistakes that can lead to incorrect behavior in production.',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#bugs'
      },
      'Vulnerabilities': {
        title: 'Security vulnerabilities that can be exploited to compromise the program.',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/security-rules/'
      },
      'Code Smells': {
        title: 'Maintainability issues that make the code harder to maintain.',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#maintainability'
      },
      'sqale_rating': {
        title: 'SQALE Rating (Maintainability Rating) indicates the effort needed to fix maintainability issues. A = Good (≤5%), B = Fair (6-10%), C = Poor (11-20%), D = Bad (21-50%), E = Very Bad (>50%)',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#maintainability-rating'
      },
      'NCLOC': {
        title: 'Non-Comment Lines of Code (NCLOC) represents the number of lines that contain actual source code (excluding comments and blank lines).',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#size'
      },
      'Lines of Code': {
        title: 'Total lines of code excluding comments and blank lines. This metric helps track the size and complexity of your codebase.',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#size'
      },
      'Security Rating': {
        title: 'Security Rating from A (best) to E (worst). A = No vulnerabilities, B = Minor vulnerabilities, C = Major vulnerabilities, D = Critical vulnerabilities, E = Blocker vulnerabilities',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#security'
      },
      'Reliability Rating': {
        title: 'Reliability Rating from A (best) to E (worst). A = No bugs, B = Minor bugs, C = Major bugs, D = Critical bugs, E = Blocker bugs',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#reliability'
      },
      'Technical Debt': {
        title: 'The estimated time needed to fix all code smells. This represents the effort required to fix all maintainability issues.',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#maintainability'
      },
      'Coverage': {
        title: 'Test coverage indicates how much of your code is covered by unit tests. Higher coverage typically means better code quality and fewer potential bugs.',
        actions: ['Learn More'],
        learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/#coverage'
      }
    };

    return details[metric] || {
      title: `Details about ${metric}`,
      actions: ['Learn More'],
      learnMoreUrl: 'https://docs.sonarqube.org/latest/user-guide/metric-definitions/'
    };
  }

  public updateMeasures = (measures: any[], qualityGate: any) => {
    if (this.view?.visible) {
      console.log('Webview: Received measures:', measures);
      console.log('Webview: Received qualityGate:', qualityGate);

      // Ensure we always have arrays to work with
      const measuresToUse = Array.isArray(measures) ? measures : [];
      
      if (measuresToUse.length === 0) {
        console.log('Webview: No measures to display');
        this.view.webview.postMessage({
          type: 'updateMeasures',
          payload: {
            measures: [],
            component: {
              key: '',
              name: '',
              qualifier: ''
            },
            timestamp: Date.now()
          }
        });
        return;
      }

      console.log('Webview: Processing measures:', measuresToUse);

      const transformedData = {
        measures: measuresToUse,
        component: qualityGate?.component || {
          key: '',
          name: '',
          qualifier: ''
        },
        timestamp: Date.now()
      };

      console.log('Webview: Sending transformed data:', transformedData);
      
      this.view.webview.postMessage({
        type: 'updateMeasures',
        payload: transformedData
      });
    } else {
      console.log('Webview: View is not visible');
    }
  };

  private getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist/media', 'quick-stats.js')
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist/media', 'quick-stats.css')
    );

    const nonce = this.getNonce();
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
        <link href="${styleMainUri}" rel="stylesheet">
        <title>SonarQube Status</title>
      </head>
      <body>
        <div class="project-info" id="project-info">
          <div class="loading-container">
            <p>Loading project info...</p>
          </div>
        </div>

        <section class="quality-gate">
          <h2>Quality Gate Status</h2>
          <div id="quality-gate-container">
            <div class="quality-gate__badge">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="animation: spin 2s linear infinite;">
                <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z"/>
              </svg>
              <p>Checking quality gate...</p>
            </div>
          </div>
        </section>

        <section class="measures">
          <div class="measures-header">
            <h2>Project Metrics</h2>
            <span id="last-update" class="last-update"></span>
          </div>
          <div id="measures-container">
            <div class="loading-container">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-2a8 8 0 0 0-8-8V2z"/>
              </svg>
              <p>Loading metrics...</p>
            </div>
          </div>
        </section>

        <script nonce="${nonce}" src="${scriptUri}"></script>
        <style>
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .measures-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .last-update {
            font-size: 0.8rem;
            opacity: 0.7;
          }
          .loading-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            padding: 2rem;
            animation: pulse 2s infinite;
          }
          .loading-container svg {
            animation: spin 2s linear infinite;
          }
        </style>
      </body>
      </html>`;
  }

  private getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
