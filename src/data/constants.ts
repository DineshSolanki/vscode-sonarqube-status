interface ProjectConfig {
  _comment: string;
  project: string;
  sonarURL?: string;
  token?: string;
}

export const VSCODE_PROJECT_CONFIG: ProjectConfig = {
  _comment: 'You can configure SonarQube settings either here or through environment variables (SONAR_HOST_URL, SONAR_TOKEN). Project.json configuration takes precedence over environment variables.',
  project: '<your-key-here>'
};

export const VSCODE_PROJECT_JSON_FORMAT_OPTIONS = {
  spaces: 4,
  EOL: '\n',
};

export const COMMANDS = {
  getStatus: 'sonarqubeStatus.get',
  refresh: 'sonarqubeStatus.refresh',
};

export const METRICS_TO_FETCH = [
  'bugs',
  'coverage',
  'code_smells',
  'alert_status',
  'vulnerabilities',
  'cognitive_complexity',
  'security_review_rating',
  'security_hotspots',
  'critical_violations',
  'duplicated_blocks',
  'sqale_index',
  'sqale_rating',
  'ncloc',
  'duplicated_lines_density',
];

export const RATING_VALUE_MAP: Record<number, string> = {
  1: 'A',
  2: 'B',
  3: 'C',
  4: 'D',
  5: 'E',
};
