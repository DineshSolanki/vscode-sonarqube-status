import * as humanize from 'humanize-duration';
import { groupBy } from 'lodash-es';
import { millify } from 'millify';
import { Client, MeasuresRequest, MeasuresResponse, SonarQubeSDKAuth } from 'sonarqube-sdk';
import * as vscode from 'vscode';
import { METRICS_TO_FETCH, RATING_VALUE_MAP } from '../data/constants';
import { Config } from '../interfaces/config.interface';
import { isConfigured } from './file.helpers';
import { fetch } from 'undici';

let client: Client | null = null;
let outputChannel: vscode.OutputChannel;

function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('SonarQube Status Debug');
  }
  return outputChannel;
}

export const sonarSDKClient = (config: Config) => {
  const channel = getOutputChannel();
  channel.appendLine('\n=== Initializing SonarQube Client ===');
  
  if (client) {
    channel.appendLine('Using existing client instance');
    return client;
  }

  const { isConfigured: configured, authType } = isConfigured(config);
  if (!configured) {
    channel.appendLine('Error: Not configured properly');
    throw new Error('Not configured');
  }

  const getAuthConfig: Record<string, () => SonarQubeSDKAuth | null> = {
    token: () =>
      config.auth?.token
        ? {
            type: 'token',
            token: config.auth?.token,
          }
        : null,
    password: () =>
      config.auth?.username && config.auth?.password
        ? {
            type: 'password',
            username: config.auth?.username,
            password: config.auth?.password,
          }
        : null,
  };

  const auth = getAuthConfig[authType]();
  if (!auth) {
    channel.appendLine('Error: Authentication not configured properly');
    throw new Error('Auth not configured');
  }
  
  try {
    channel.appendLine(`Connecting to SonarQube at: ${config.sonarURL}`);
    channel.appendLine(`Using auth type: ${authType}`);
    
    // Initialize the client
    client = new Client({ url: config.sonarURL, auth });
    channel.appendLine('SonarQube client initialized successfully');
    return client;
  } catch (error: any) {
    channel.appendLine(`Error creating SonarQube client: ${error?.message || 'Unknown error'}`);
    if (error?.stack) {
      channel.appendLine('Stack trace:');
      channel.appendLine(error.stack);
    }
    throw error;
  }
};

interface SonarResponse {
  component: {
    key: string;
    name: string;
    qualifier: string;
    measures: Array<{
      metric: string;
      value: string;
      bestValue?: boolean;
    }>;
  };
}

export async function getMetrics(config: Config) {
  const channel = getOutputChannel();
  channel.appendLine('\n=== Fetching SonarQube Metrics ===');
  channel.show(true);
  
  try {
    const sonarClient = sonarSDKClient(config);
    if (sonarClient) {
      channel.appendLine(`Fetching measures for project: ${config.project}`);
      channel.appendLine(`Metrics to fetch: ${METRICS_TO_FETCH.join(', ')}`);
      
      // Make direct fetch call since the SDK doesn't handle the response format correctly
      const authHeader = config.auth?.token 
        ? `Basic ${Buffer.from(config.auth.token + ':').toString('base64')}`
        : `Basic ${Buffer.from(config.auth?.username + ':' + config.auth?.password).toString('base64')}`;
      
      const response = await fetch(`${config.sonarURL}/api/measures/component?component=${config.project}&metricKeys=${METRICS_TO_FETCH.join(',')}`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });
      
      channel.appendLine(`API call status: ${response.status}`);
      const text = await response.text();
      channel.appendLine('Raw API response:');
      channel.appendLine(text);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      try {
        const data = JSON.parse(text);
        channel.appendLine('Successfully parsed JSON response');
        
        // Return the raw response data instead of transforming it
        return data;

      } catch (parseError) {
        channel.appendLine('Failed to parse JSON response:');
        throw parseError;
      }
    }
    channel.appendLine('No SonarQube client available');
    return null;
  } catch (error: any) {
    channel.appendLine('Error fetching metrics:');
    channel.appendLine(error?.message || 'Unknown error');
    if (error?.stack) {
      channel.appendLine('Stack trace:');
      channel.appendLine(error.stack);
    }
    throw error;
  }
}

function parseResponse(
  measures: MeasuresResponse.ComponentBaseMeasures[],
  metrics: MeasuresResponse.ComponentMetric[]
) {
  const metricsMeta: Record<string, any> = metrics.reduce(
    (acc, curr) => ({ ...acc, [curr.key]: curr }),
    {}
  );
  const dataFormatted = measures.map((item) => ({
    meta: metricsMeta[item.metric],
    label: metricsMeta[item.metric].name,
    type: metricsMeta[item.metric].type,
    domain: item.metric === 'alert_status' ? 'Releasability' :
            item.metric.includes('security') ? 'Security' :
            item.metric === 'bugs' ? 'Reliability' :
            item.metric.includes('duplicated') ? 'Duplications' :
            item.metric === 'code_smells' || item.metric === 'sqale_rating' ? 'Maintainability' :
            item.metric === 'ncloc' ? 'Size' :
            'Issues',
    value: addFormatting(item.value, metricsMeta[item.metric]),
  }));

  const grouped = groupBy(dataFormatted, 'domain');
  return grouped;
}

function addFormatting(value: string | undefined, opts: any) {
  if (!value) {
    return null;
  }
  const { type } = opts;
  switch (type) {
    case 'INT':
      return millify(+value);
    case 'PERCENT':
      return `${value} %`;
    case 'WORK_DUR':
      return humanize(+value * 60000, { largest: 1 });
    case 'RATING':
      return RATING_VALUE_MAP[+value];
    case 'LEVEL':
      return value;
    default:
      return value;
  }
}
