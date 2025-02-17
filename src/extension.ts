import * as vscode from 'vscode';
import { COMMANDS } from './data/constants';
import { checkAndCreateConfigFileIfNeeded } from './helpers/file.helpers';
import { getMetrics } from './helpers/sonar.helper';
import { SonarQuickStatsProvider } from './views/quick-stats.webview';

let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  // Create and show output channel immediately
  outputChannel = vscode.window.createOutputChannel('SonarQube Status');
  outputChannel.show(true); // true means bring to front
  outputChannel.appendLine('SonarQube Status extension activated');
  
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  statusBarItem.command = COMMANDS.getStatus;
  const quickInfoProvider = new SonarQuickStatsProvider(context.extensionUri);
  const quickInfoWebView = vscode.window.registerWebviewViewProvider(
    'sonarqubeStatus.quickInfo',
    quickInfoProvider
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.getStatus, getStatusWithProgress)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.refresh, getStatusWithProgress)
  );
  context.subscriptions.push(quickInfoWebView);
  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(outputChannel);

  async function getSonarQubeStatus() {
    outputChannel.clear(); // Clear previous output
    outputChannel.show(true); // Make sure it's visible
    outputChannel.appendLine('=== Starting SonarQube Status Check ===');
    
    const workspace = vscode.workspace.workspaceFolders;
    if (workspace) {
      outputChannel.appendLine('Checking configuration...');

      // Check if the config file exists in .vscode/project.json and prompt user to create it if missing
      const configFiles = await vscode.workspace.findFiles('.vscode/project.json', null, 1);
      if (configFiles.length === 0) {
        const createConfig = await vscode.window.showInformationMessage(
          'No project configuration file found. Would you like to create a default one?',
          'Create Config',
          'Cancel'
        );
        if (createConfig === 'Create Config') {
          try {
            const config = await require('./helpers/file.helpers').createDefaultConfigFile(workspace[0].uri.path);
            const configFileUri = vscode.Uri.file(`${workspace[0].uri.path}/.vscode/project.json`);
            const document = await vscode.workspace.openTextDocument(configFileUri);
            await vscode.window.showTextDocument(document);
            outputChannel.appendLine('Default configuration file created and opened. Please update it with your project settings.');
          } catch (err: any) {
            const msg = 'Failed to create config file: ' + (err.message || 'Unknown error');
            outputChannel.appendLine(msg);
            vscode.window.showErrorMessage(msg);
            quickInfoProvider.updateMeasures([], null);
            return;
          }
        } else {
          outputChannel.appendLine('Configuration file creation cancelled by user.');
          quickInfoProvider.updateMeasures([], null);
          return;
        }
      }

      const { configured, config } = await checkAndCreateConfigFileIfNeeded(
        workspace[0].uri.path as string
      );
      if (config === null) {
        const msg = 'Please configure the project first!';
        outputChannel.appendLine(msg);
        vscode.window.showErrorMessage(msg, 'Okay');
        quickInfoProvider.updateMeasures([], null);
        return;
      }
      if (configured) {
        try {
          outputChannel.appendLine('Configuration found, fetching metrics...');
          outputChannel.appendLine(`Project: ${config.project}`);
          outputChannel.appendLine(`SonarQube URL: ${config.sonarURL}`);
          outputChannel.appendLine(`Auth type: ${config.auth?.token ? 'token' : 'username/password'}`);
          
          const data = await getMetrics(config);
          outputChannel.appendLine(data ? 'Successfully received metrics data' : 'No data received from SonarQube');
          
          if (data) {
            quickInfoProvider.updateMeasures(
              [
                ...(data['Reliability'] || []),
                ...(data['Security'] || []),
                ...(data['SecurityReview'] || []),
                ...(data['Maintainability'] || []),
                ...(data['Duplications'] || []),
                ...(data['Issues'] || []),
                ...(data['Size'] || []),
              ],
              data['Releasability']?.[0]
            );
            const status = data['Releasability']?.[0]?.value;
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
            const msg = 'No data received from SonarQube. Please check your project key and credentials.';
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
    else {
      const msg = 'No workspace found. Please open a workspace to use this extension.';
      outputChannel.appendLine(msg);
      vscode.window.showErrorMessage(msg, 'Okay');
      quickInfoProvider.updateMeasures([], null);
    }
  }

  function getStatusWithProgress() {
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

  // Trigger initial status check on activation
  getStatusWithProgress();
}

export function deactivate() {}
