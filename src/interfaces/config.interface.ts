export interface Config {
  project: string;
  sonarURL?: string;  // Optional since it can come from env vars
  token?: string;     // Optional since it can come from env vars
}
