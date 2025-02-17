import { ensureDir, ensureFile, outputJson, readJson } from 'fs-extra';
import { has, isEmpty } from 'lodash-es';
import { commands } from 'vscode';
import { VSCODE_PROJECT_CONFIG, VSCODE_PROJECT_JSON_FORMAT_OPTIONS } from '../data/constants';
import { Config } from '../interfaces/config.interface';

interface EnvConfig {
  sonarURL?: string;
  token?: string;
}

function getEnvConfig(): EnvConfig {
  return {
    sonarURL: process.env.SONAR_HOST_URL,
    token: process.env.SONAR_TOKEN
  };
}

export function getIsAuthConfigured(config: Config) {
  const envConfig = getEnvConfig();
  
  // Check file-based token first
  if (has(config, 'token') && config.token && !isEmpty(config.token) && !config.token?.includes('sonar-token')) {
    return { isAuthConfigured: true };
  }

  // Only check environment variable if no token in config
  return { isAuthConfigured: !isEmpty(envConfig.token) };
}

function getIsProjectKeyConfigured(config: Config) {
  return (
    has(config, 'project') && !isEmpty(config.project) && !config.project.includes('your-key-here')
  );
}

function getSonarURLConfigured(config: Config) {
  const envConfig = getEnvConfig();
  
  // If sonarURL exists in project.json, only validate that
  if (has(config, 'sonarURL')) {
    return !isEmpty(config.sonarURL) &&
           config.sonarURL &&
           !config.sonarURL.includes('your-sonar-url');
  }
  
  // Only check env var if no sonarURL in project.json
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

export const createDefaultConfigFile = async (path: string) => {
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

    await outputJson(
      `${path}/.vscode/project.json`,
      defaultConfig,
      VSCODE_PROJECT_JSON_FORMAT_OPTIONS
    );
    return defaultConfig;
  } catch (error) {
    throw new Error('Failed to create config file');
  }
};

export const getConfigFile = async (path: string) => {
  try {
    await ensureFile(`${path}/.vscode/project.json`);
    const config = await readJson(`${path}/.vscode/project.json`);
    const configured = config && isConfigured(config);
    commands.executeCommand('setContext', 'sonarqube-status.isConfigured', configured);
    return { configured, config };
  } catch (error) {
    commands.executeCommand('setContext', 'sonarqube-status.isConfigured', false);
    return { configured: false, config: null };
  }
};

export const checkAndCreateConfigFileIfNeeded = async (path: string) => {
  try {
    await ensureDir(`${path}/.vscode`);
    let config = null;
    let configured = false;
    const configResult = await getConfigFile(path);
    if (!configResult.configured) {
      config = await createDefaultConfigFile(path);
    } else {
      config = configResult.config;
      configured = configResult.configured;
    }
    commands.executeCommand('setContext', 'sonarqube-status.isConfigured', configResult);
    return { configured, config };
  } catch (error) {
    throw new Error('Failed to configure');
  }
};
