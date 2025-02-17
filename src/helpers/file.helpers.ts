import { ensureDir, ensureFile, outputJson, readJson } from 'fs-extra';
import { has, isEmpty } from 'lodash-es';
import { commands, Uri, workspace } from 'vscode';
import { VSCODE_PROJECT_CONFIG, VSCODE_PROJECT_JSON_FORMAT_OPTIONS } from '../data/constants';
import { Config } from '../interfaces/config.interface';
import * as path from 'path';

interface EnvConfig {
  sonarURL?: string;
  token?: string;
}

function getVSCodeSettings(): EnvConfig & { project?: string } {
  const config = workspace.getConfiguration('sonarqubeStatus');
  return {
    project: config.get('project'),
    sonarURL: config.get('sonarURL'),
    token: config.get('token')
  };
}

function getEnvConfig(): EnvConfig {
  return {
    sonarURL: process.env.SONAR_HOST_URL,
    token: process.env.SONAR_TOKEN
  };
}

export function getIsAuthConfigured(config: Config) {
  const vscodeSettings = getVSCodeSettings();
  const envConfig = getEnvConfig();
  
  // Check VS Code settings first
  if (vscodeSettings.token && !isEmpty(vscodeSettings.token)) {
    return { isAuthConfigured: true };
  }
  
  // Check file-based token second
  if (has(config, 'token') && config.token && !isEmpty(config.token) && !config.token?.includes('sonar-token')) {
    return { isAuthConfigured: true };
  }

  // Finally check environment variable
  return { isAuthConfigured: !isEmpty(envConfig.token) };
}

function getIsProjectKeyConfigured(config: Config) {
  const vscodeSettings = getVSCodeSettings();
  
  // Check VS Code settings first
  if (vscodeSettings.project && !isEmpty(vscodeSettings.project)) {
    return true;
  }
  
  return (
    has(config, 'project') && !isEmpty(config.project) && !config.project.includes('your-key-here')
  );
}

function getSonarURLConfigured(config: Config) {
  const vscodeSettings = getVSCodeSettings();
  const envConfig = getEnvConfig();
  
  // Check VS Code settings first
  if (vscodeSettings.sonarURL && !isEmpty(vscodeSettings.sonarURL)) {
    return true;
  }
  
  // Check project.json second
  if (has(config, 'sonarURL')) {
    return !isEmpty(config.sonarURL) &&
           config.sonarURL &&
           !config.sonarURL.includes('your-sonar-url');
  }
  
  // Finally check env var
  return !isEmpty(envConfig.sonarURL);
}

export const isConfigured = (config: Config) => {
  const isProjectKeyConfigured = getIsProjectKeyConfigured(config);
  const isSonarURLConfigured = getSonarURLConfigured(config);
  const { isAuthConfigured } = getIsAuthConfigured(config);
  return {
    isConfigured: isProjectKeyConfigured && isSonarURLConfigured && isAuthConfigured,
    isProjectKeyConfigured,
    isSonarURLConfigured,
    isAuthConfigured
  };
};

export const createDefaultConfigFile = async (filePath: string) => {
  try {
    const envConfig = getEnvConfig();
    interface DefaultConfig {
      project: string;
      sonarURL?: string;
      token?: string;
    }

    const defaultConfig: DefaultConfig = {
      project: VSCODE_PROJECT_CONFIG.project
    };

    // Only include sonarURL and token if env vars are not present
    if (!envConfig.sonarURL && VSCODE_PROJECT_CONFIG.sonarURL) {
      defaultConfig.sonarURL = VSCODE_PROJECT_CONFIG.sonarURL;
    }
    
    if (!envConfig.token && VSCODE_PROJECT_CONFIG.token) {
      defaultConfig.token = VSCODE_PROJECT_CONFIG.token;
    }

    // Use VS Code's URI handling to ensure correct path format
    const uri = Uri.file(filePath);
    const configPath = path.join(uri.fsPath, '.vscode', 'project.json');
    const vscodeDir = path.join(uri.fsPath, '.vscode');
    
    // Ensure the .vscode directory exists
    await ensureDir(vscodeDir);
    
    await outputJson(
      configPath,
      defaultConfig,
      VSCODE_PROJECT_JSON_FORMAT_OPTIONS
    );
    return defaultConfig;
  } catch (error: any) {
    throw new Error(`Failed to create config file: ${error.message}`);
  }
};

export const getConfigFile = async (filePath: string) => {
  try {
    const uri = Uri.file(filePath);
    const configPath = path.join(uri.fsPath, '.vscode', 'project.json');
    
    await ensureFile(configPath);
    const config = await readJson(configPath);
    const configured = config && isConfigured(config);
    commands.executeCommand('setContext', 'sonarqube-status.isConfigured', configured);
    return { configured, config };
  } catch (error) {
    commands.executeCommand('setContext', 'sonarqube-status.isConfigured', false);
    return { configured: false, config: null };
  }
};

export const checkAndCreateConfigFileIfNeeded = async (filePath: string) => {
  try {
    const uri = Uri.file(filePath);
    const vscodeDir = path.join(uri.fsPath, '.vscode');
    await ensureDir(vscodeDir);
    
    let config = null;
    let configured = false;
    const configResult = await getConfigFile(filePath);
    if (!configResult.configured) {
      config = await createDefaultConfigFile(filePath);
    } else {
      config = configResult.config;
      configured = configResult.configured;
    }
    commands.executeCommand('setContext', 'sonarqube-status.isConfigured', configResult);
    return { configured, config };
  } catch (error: any) {
    throw new Error(`Failed to configure: ${error.message}`);
  }
};
