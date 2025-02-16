import * as vscode from 'vscode';
import { COMMANDS } from './data/constants';
import { checkAndCreateConfigFileIfNeeded } from './helpers/file.helpers';
import { getMetrics } from './helpers/sonar.helper';
import { SonarQuickStatsProvider } from './views/quick-stats.webview';

interface SonarMeasure {
  metric: string;
  value: string;
  bestValue?: boolean;
}

interface SonarResponse {
  component: {
    key: string;
    name: string;
    qualifier: string;
    measures: SonarMeasure[];
  };
}

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  // Create and show output channel immediately
  outputChannel = vscode.window.createOutputChannel('SonarQube Status');
  outputChannel.show(true); // true means bring to front
  outputChannel.appendLine('SonarQube Status extension activated');
  
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = COMMANDS.getStatus;
  
  // Initialize the webview provider
  const quickInfoProvider = new SonarQuickStatsProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('sonarqubeStatus.quickInfo', quickInfoProvider, {
      webviewOptions: {
        retainContextWhenHidden: true  // Keep the webview's state even when hidden
      }
    })
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.getStatus, () => getStatusWithProgress(quickInfoProvider, statusBarItem)),
    vscode.commands.registerCommand(COMMANDS.refresh, () => getStatusWithProgress(quickInfoProvider, statusBarItem))
  );

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(outputChannel);

  // Initial status check after a short delay to ensure webview is ready
  setTimeout(() => {
    getStatusWithProgress(quickInfoProvider, statusBarItem);
  }, 1000);

  async function getSonarQubeStatus() {
    outputChannel.clear();
    outputChannel.show(true);
    outputChannel.appendLine('=== Starting SonarQube Status Check ===');
    
    const workspace = vscode.workspace.workspaceFolders;
    if (workspace) {
      outputChannel.appendLine('Checking configuration...');
      const { configured, config } = await checkAndCreateConfigFileIfNeeded(
        workspace[0].uri.path as string
      );
      if (config === null) {
        const msg = 'Please configure the project first!';
        outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg, 'Okay');
        return;
      }
      if (configured) {
        try {
          outputChannel.appendLine('Configuration found, fetching metrics...');
          outputChannel.appendLine(`Project: ${config.project}`);
          outputChannel.appendLine(`SonarQube URL: ${config.sonarURL}`);
          
          const data = await getMetrics(config);
          outputChannel.appendLine('Raw response data:');
          outputChannel.appendLine(JSON.stringify(data, null, 2));
          
          if (data?.component?.measures) {
            outputChannel.appendLine(`Found ${data.component.measures.length} measures`);
            
            // Pass the raw measures and component info
            quickInfoProvider.updateMeasures(
              data.component.measures,
              {
                component: {
                  key: data.component.key,
                  name: data.component.name || config.project,
                  qualifier: data.component.qualifier || 'TRK',
                  measures: data.component.measures
                }
              }
            );

            const status = data.component.measures.find((m: SonarMeasure) => m.metric === 'alert_status')?.value;
            outputChannel.appendLine(`Quality gate status: ${status || 'unknown'}`);
            
            let statusBarText = null;
            if (status === 'ERROR') {
              statusBarText = `$(testing-failed-icon) SonarQube: Failed`;
            } else if (status === 'OK') {
              statusBarText = `$(testing-passed-icon) SonarQube: Passed`;
            }
            if (statusBarText) {
              statusBarItem.text = statusBarText;
              statusBarItem.show();
            } else {
              statusBarItem.hide();
            }
          } else {
            outputChannel.appendLine('No measures found in response');
            outputChannel.appendLine('Response structure:');
            outputChannel.appendLine(JSON.stringify(Object.keys(data || {}), null, 2));
            
            const msg = 'No measures received from SonarQube. Please check your project key and credentials.';
            outputChannel.appendLine(msg);
            vscode.window.showErrorMessage(msg);
            quickInfoProvider.updateMeasures([], null);
          }
        } catch (error: any) {
          const msg = `Failed to fetch measures: ${error?.message || 'Unknown error'}`;
          outputChannel.appendLine('Error occurred:');
          outputChannel.appendLine(msg);
          if (error?.stack) {
            outputChannel.appendLine(error.stack);
          }
          vscode.window.showErrorMessage(msg);
          quickInfoProvider.updateMeasures([], null);
        }
      } else {
        const msg = 'Please update the config in .vscode/project.json file';
        outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg, 'Okay');
      }
    }
  }

  function getStatusWithProgress(quickInfoProvider: SonarQuickStatsProvider, statusBarItem: vscode.StatusBarItem) {
    outputChannel.show();
    outputChannel.appendLine('\n--- Refreshing SonarQube Status ---');
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refreshing Sonarqube report...',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 10 });
        await getSonarQubeStatus();
        progress.report({ increment: 100 });
      }
    );
  }
}

export function deactivate() {}
