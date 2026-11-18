import type { CheckResult } from '@shared/types';

export const RESULT_LABELS: Record<CheckResult, string> = {
  success: 'Success',
  http_error: 'HTTP error',
  timeout: 'Timed out',
  connection_error: 'Connection failed',
  blocked: 'Blocked target',
  invalid_url: 'Invalid URL',
};

export const CAUSE_LABELS: Record<CheckResult, string> = {
  success: 'Recovered',
  http_error: 'HTTP error',
  timeout: 'Timed out',
  connection_error: 'Connection failed',
  blocked: 'Blocked target',
  invalid_url: 'Invalid URL',
};

export function resultTone(result: CheckResult): string {
  return result === 'success' ? 'text-success' : 'text-destructive';
}
