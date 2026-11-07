export type SystemEnvironment = 'production' | 'staging' | 'development' | 'other';
export type SystemCategory = 'application' | 'website' | 'infrastructure' | 'integration' | 'other';
export interface FlownSystem {
  id: string;
  name: string;
  description: string;
  owner_id: string | null;
  category: SystemCategory;
  environment: SystemEnvironment;
  url: string;
  monitor_url: string;
  monitoring_enabled: boolean;
  created_at: string;
  updated_at: string;
}
export interface SystemCheck {
  id: string;
  system_id: string;
  checked_at: string;
  endpoint_url: string;
  outcome: 'up' | 'down' | 'blocked';
  http_status: number | null;
  latency_ms: number | null;
  error: string | null;
  trigger_source: 'manual' | 'scheduled';
}
export interface MonitorSummary {
  system_id: string;
  sample_count: number;
  up_count: number;
  blocked_count: number;
  avg_latency_ms: number | null;
  latest_check: SystemCheck | null;
}
export interface SystemIncident {
  id: string;
  system_id: string;
  title: string;
  notes: string;
  severity: 'minor' | 'major' | 'critical';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  started_at: string;
  resolved_at: string | null;
}
export interface SystemMaintenance {
  id: string;
  system_id: string;
  title: string;
  notes: string;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}
