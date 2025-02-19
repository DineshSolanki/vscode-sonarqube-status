import * as humanize from 'humanize-duration';
import { groupBy } from 'lodash-es';
import { millify } from 'millify';
import { Client, MeasuresRequest, MeasuresResponse, SonarQubeSDKAuth } from 'sonarqube-sdk';
import * as vscode from 'vscode';
import { METRICS_TO_FETCH, RATING_VALUE_MAP } from '../data/constants';
import { Config } from '../interfaces/config.interface';
import { isConfigured } from './file.helpers';
import { fetch } from 'undici';
import { workspace } from 'vscode';

let client: Client | null = null;
let outputChannel: vscode.OutputChannel;

function getOutputChannel() {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('SonarQube Status Debug');
  }
  return outputChannel;
}

function getMergedConfig(config: Config) {
  const vscodeSettings = workspace.getConfiguration('sonarqubeStatus');
  
  // VS Code settings take highest precedence, specify types explicitly
  return {
    project: vscodeSettings.get<string>('project') || config.project,
    sonarURL: vscodeSettings.get<string>('sonarURL') || config.sonarURL || process.env.SONAR_HOST_URL,
    token: vscodeSettings.get<string>('token') || config.token || process.env.SONAR_TOKEN
  };
}

export const sonarSDKClient = (config: Config) => {
  const channel = getOutputChannel();
  channel.appendLine('\n=== Initializing SonarQube Client ===');
  
  if (client) {
    channel.appendLine('Using existing client instance');
    return client;
  }

  const mergedConfig = getMergedConfig(config);
  const { isConfigured: configured } = isConfigured(config);
  if (!configured) {
    channel.appendLine('Error: Not configured properly');
    throw new Error('Not configured');
  }

  if (!mergedConfig.token) {
    channel.appendLine('Error: Token not configured');
    throw new Error('Token not configured');
  }

  if (!mergedConfig.sonarURL) {
    channel.appendLine('Error: SonarQube URL not configured');
    throw new Error('SonarQube URL not configured');
  }
  
  try {
    channel.appendLine(`Connecting to SonarQube at: ${mergedConfig.sonarURL}`);
    channel.appendLine('Using token authentication');
    
    client = new Client({ 
      url: mergedConfig.sonarURL, 
      auth: {
        type: 'token',
        token: mergedConfig.token
      }
    });
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
    const mergedConfig = getMergedConfig(config);
    const sonarClient = sonarSDKClient(config);
    if (sonarClient) {
      channel.appendLine(`Fetching measures for project: ${mergedConfig.project}`);
      channel.appendLine(`Metrics to fetch: ${METRICS_TO_FETCH.join(', ')}`);
      
      // Make direct fetch call since the SDK doesn't handle the response format correctly
      const authHeader = `Basic ${Buffer.from(mergedConfig.token + ':').toString('base64')}`;
      
      const response = await fetch(`${mergedConfig.sonarURL}/api/measures/component?component=${mergedConfig.project}&metricKeys=${METRICS_TO_FETCH.join(',')}`, {
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
      
      const data = JSON.parse(text) as SonarResponse;
      
      if (data?.component?.measures) {
        // Convert the response to match what the SDK expects
        const measures = data.component.measures.map(m => ({
          metric: m.metric,
          value: m.value,
          bestValue: m.bestValue
        }));

        // Create metrics metadata from the measures
        const metrics = METRICS_TO_FETCH.map(key => {
          const measure = measures.find(m => m.metric === key);
          const type = measure?.value.includes('.') ? 'PERCENT' : 
                      key === 'alert_status' ? 'LEVEL' :
                      ['security_review_rating', 'sqale_rating'].includes(key) ? 'RATING' : 'INT';
          
          // Determine domain based on metric key
          const domain = key === 'alert_status' ? 'Releasability' :
                        key.includes('security') ? 'Security' :
                        key === 'bugs' ? 'Reliability' :
                        key.includes('duplicated') ? 'Duplications' :
                        key === 'code_smells' || key === 'sqale_rating' ? 'Maintainability' :
                        key === 'ncloc' ? 'Size' : 'Issues';

          return {
            key,
            name: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
            type,
            domain,
            description: `Metric: ${key}`,
            qualitative: type === 'RATING' || type === 'LEVEL',
            hidden: false,
            direction: key.includes('rating') || key === 'coverage' ? 1 : -1,
            higherValuesAreBetter: key.includes('rating') || key === 'coverage',
            custom: false // Required by ComponentMetric type
          };
        });

        channel.appendLine('Successfully parsed response');
        channel.appendLine(`Found ${measures.length} measures`);
        
        const parsed = parseResponse(measures, metrics);
        return parsed;
      }
      
      channel.appendLine('No measures found in response');
      return null;
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
