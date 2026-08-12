export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  trace_id: string;
}

export interface ApiFailure {
  code?: string;
  message?: string;
  detail?: string;
  trace_id?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  status: string;
  roles: string[];
  permissions: string[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  purge_after?: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface DependencyHealth {
  status: 'ready' | 'degraded';
  dependencies: Record<string, 'ok' | 'failed'>;
}

export interface AlgorithmVersion {
  id: number;
  algorithm_id: number | null;
  code: string;
  name: string;
  version: string;
  task_type: 'forecast' | 'data_quality' | 'anomaly_detection' | string;
  runtime_type: string;
  default_params: Record<string, unknown>;
  status: string;
  execution_status: string;
  default_model_file_id: number | null;
  requires_gpu: boolean;
}

export interface AlgorithmRunRequest {
  dataset_version_id: number;
  algorithm_code: string;
  monitor_point_id?: number | null;
  metric_code: string;
  horizon: number;
  context_length: number;
  value_source: 'raw' | 'processed';
  algorithm_params: Record<string, unknown>;
}

export interface TaskDetail {
  task_id: string;
  task_type: string;
  status: string;
  progress: number;
  trace_id: string;
  dataset_version_id: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  priority?: number;
  attempt_no?: number;
  max_attempts?: number;
  rerun_of_task_id?: string | null;
  worker_id?: string | null;
  heartbeat_at?: string | null;
  next_retry_at?: string | null;
  state_revision?: number;
}

export interface TaskPage {
  items: TaskDetail[];
  page: number;
  page_size: number;
  total: number;
}

export interface TaskLog {
  event_type: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DataSourceSummary {
  id: number;
  source_code: string;
  source_name: string;
  source_type: 'mysql' | 'csv';
  is_read_only: boolean;
  is_enabled: boolean;
  watermark_value: string | null;
  csv_import_status?: string | null;
  csv_upload_batch_code?: string | null;
}

export interface TimeSeriesPoint {
  time: string;
  raw_value: number | null;
  processed_value: number | null;
  source_status: string | null;
  repair_status: string | null;
}

export interface AlgorithmResult {
  id: number;
  result_type: 'quality' | 'forecast' | 'anomaly' | string;
  metric_code: string | null;
  monitor_point_id: number | null;
  trace_id: string;
  payload: Record<string, unknown>;
  input_time_start: string | null;
  input_time_end: string | null;
}

export interface DataSourceCreateRequest {
  source_code: string;
  source_name: string;
  source_type: 'mysql';
  connection_config: Record<string, unknown>;
  field_mapping: Record<string, unknown>;
  is_read_only: true;
}

export interface UserView extends AuthUser {
  resource_counts?: {
    datasets: number;
    workflows: number;
    tasks: number;
  };
}

export interface UserPage {
  items: UserView[];
  page: number;
  page_size: number;
  total: number;
}

export type RecycleResourceType =
  'dataset' | 'data_source' | 'csv_upload_draft' | 'workflow' | 'task' | 'user';

export interface RecycleBinItem {
  item_id: string;
  resource_type: RecycleResourceType;
  resource_id: string;
  resource_name: string;
  owner_user_id: number | null;
  deleted_by_user_id: number | null;
  deletion_batch_id: string | null;
  status: 'trashed' | 'purging' | 'purge_failed' | 'restored' | 'purged';
  summary: Record<string, unknown>;
  deleted_at: string;
  purge_after: string;
  restored_at: string | null;
  purged_at: string | null;
  error_message: string | null;
}

export interface RecycleBinPage {
  items: RecycleBinItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface StartTaskResponse {
  task_id: string;
  batch_code?: string;
}

/** S01 DMA 漏损评估的后端契约。候选仅用于人工核验，不代表漏点结论。 */
export type S01BindingRole =
  | 'inlet_flow'
  | 'outlet_flow'
  | 'authorized_consumption'
  | 'known_losses'
  | 'legitimate_night_use'
  | 'pressure';

export interface S01Template {
  template_code: string;
  template_name: string;
  contract_version: number;
  execution_mode: string;
  required_binding_roles: S01BindingRole[];
  nodes: Array<Record<string, unknown>>;
  candidate_notice: string;
}

export interface S01Dma {
  id: number;
  code: string;
  name: string;
  description: string | null;
  timezone: string;
  status: string;
  created_by_user_id: number | null;
  created_at: string;
}

export interface S01DatasetChannel {
  monitor_point_id: number;
  source_key: string;
  point_name: string;
  metric_code: string;
  record_count: number;
  time_start: string | null;
  time_end: string | null;
}

export interface S01DmaBinding {
  id: number;
  role: S01BindingRole;
  monitor_point_id: number;
  metric_code: string;
  value_source: 'raw' | 'processed';
  multiplier: number;
  is_required: boolean;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface S01BindingCreateRequest {
  binding_role: S01BindingRole;
  monitor_point_id: number;
  metric_code: string;
  value_source: 'raw' | 'processed';
  multiplier: number;
  is_required: boolean;
  metadata_json: Record<string, unknown>;
}

export interface S01RunRequest {
  dma_id: number;
  dataset_version_id: number;
  quality_gate_min: number;
  expected_interval_seconds: number;
  node_params: Record<string, Record<string, number>>;
}

export interface S01RunSummary {
  run_id: string;
  task_id: string;
  dma_id: number;
  dataset_version_id: number;
  template_code: string;
  status: string;
  task_status: string;
  progress: number;
  quality_score: number | null;
  error_code: string | null;
  error_message: string | null;
  trace_id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface S01NodeRun {
  id: number;
  node_code: string;
  node_name: string;
  execution_order: number;
  status: string;
  progress: number;
  input_snapshot: Record<string, unknown>;
  params_snapshot: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface S01Candidate {
  id: number;
  assessment_run_id: string;
  node_run_id: number | null;
  start_time: string | null;
  end_time: string | null;
  risk_score: number;
  evidence: Record<string, unknown>;
  status: string;
  trace_id: string;
  created_at: string;
}
export interface DatasetVersion {
  id: number;
  version_code: string;
  status: string;
  record_count: number;
  time_start: string | null;
  time_end: string | null;
  created_at: string;
  parent_version_id?: number | null;
  version_kind?: 'imported' | 'derived' | string;
  storage_backend?: 'mysql' | 'parquet' | string;
  version_note?: string | null;
}

/** A user-visible data asset. The id remains an internal API reference. */
export interface DataAsset {
  id: number;
  code: string;
  name: string;
  source_id: number | null;
  source_type: 'mysql' | 'csv' | null;
  status?: 'active' | 'archived' | 'purging' | 'purge_failed' | string;
  created_at: string;
  latest_version: DatasetVersion | null;
  description?: string | null;
  business_tags?: string[];
  data_type?: string;
  version_count?: number;
  channel_count?: number;
  latest_quality?: DataQualityReport | null;
}

export interface DataQualityReport {
  id: string;
  dataset_version_id: number;
  workflow_run_id: string | null;
  node_run_id: number | null;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | string;
  dimensions: Record<string, number>;
  issue_summary: Record<string, number>;
  trace_id: string;
  sha256: string;
  created_at: string;
  report?: Record<string, unknown>;
}

export interface DatasetLineage {
  version: DatasetVersion;
  ancestors: DatasetVersion[];
  created_by_task_id: string | null;
  workflow_run_id: string | null;
  workflow_graph: Record<string, unknown> | null;
}

export interface DatasetChannel {
  monitor_point_id: number;
  source_key: string;
  point_name: string;
  metric_code: string;
  metric_name: string;
  unit: string | null;
  record_count: number;
  time_start: string | null;
  time_end: string | null;
  raw_available: boolean;
  processed_available: boolean;
}

export interface DataAssetContext {
  asset: DataAsset;
  version: DatasetVersion;
  channels: DatasetChannel[];
}

export interface DataAssetSelection extends DataAssetContext {
  channel: DatasetChannel | null;
  value_source: 'raw' | 'processed';
}

export interface CsvUploadDraft {
  batch_code: string;
  source: DataSourceSummary;
  headers: string[];
  sample_rows: Record<string, string>[];
  encoding: string;
  size_bytes: number;
}

export interface CsvMetricMapping {
  code: string;
  name: string;
  unit?: string | null;
  raw_column: string;
  processed_column?: string | null;
  status_column?: string | null;
  repair_flag_column?: string | null;
}

export interface CsvImportMapping {
  point_column: string;
  time_column: string;
  record_id_column?: string | null;
  metrics: CsvMetricMapping[];
}

export type QueryValue = string | number | boolean | null | undefined;

export interface WorkflowRunSummary {
  run_id: string;
  workflow_version_id: number;
  workflow_id: number | null;
  workflow_name: string | null;
  workflow_version: number | null;
  task_id: string;
  status: string;
  task_status: string | null;
  progress: number;
  trace_id: string;
  input_bindings: Record<string, unknown>;
  parameter_overrides: Record<string, unknown>;
  graph_snapshot: Record<string, unknown>;
  node_count: number;
  node_success_count: number;
  node_failed_count: number;
  node_running_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkflowRunPage {
  items: WorkflowRunSummary[];
  page: number;
  page_size: number;
  total: number;
}

export interface WorkflowNodeRun {
  id: number;
  node_instance_id: string;
  node_code: string;
  node_version: string;
  status: string;
  progress: number;
  params_snapshot: Record<string, unknown>;
  input_snapshot: Record<string, unknown>;
  output_snapshot: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface WorkflowArtifact {
  id: number;
  node_run_id: number;
  node_instance_id: string | null;
  node_code: string | null;
  port_key: string;
  data_type: string;
  semantic_type: string | null;
  unit: string | null;
  content_type: string | null;
  storage: 'inline' | 'minio';
  size_bytes: number;
  sha256: string | null;
  preview: Record<string, unknown>;
  payload?: Record<string, unknown>;
  created_at: string;
  is_final?: boolean;
}

export interface WorkflowResult {
  run: WorkflowRunSummary;
  outputs: WorkflowArtifact[];
}

export interface OperatorVersionSummary {
  id: number;
  version: string;
  status: string;
  runtime_type: string;
  executor_type: string;
  maturity: string;
  contract_sha256: string | null;
  input_ports: Array<Record<string, unknown>>;
  output_ports: Array<Record<string, unknown>>;
  parameter_schema: Record<string, unknown>;
  ui_schema: Record<string, unknown>;
  visualization_schema: Record<string, unknown>;
  algorithm: Record<string, unknown> | null;
  available: boolean;
}

export interface OperatorSummary {
  code: string;
  name: string;
  description: string;
  kind: string;
  category: string;
  status: string;
  visibility: string;
  disabled_reason: string | null;
  available: boolean;
  unavailable_reason: string | null;
  can_manage: boolean;
  active_version: OperatorVersionSummary | null;
  version_count: number;
  versions?: OperatorVersionSummary[];
}

export interface WorkflowTemplateSummary {
  template_code: string;
  version: string;
  name: string;
  description: string;
  required_bindings: string[];
  outputs: string[];
  node_count: number;
  edge_count: number;
}

export interface RuntimeProfile {
  id: number;
  profile_code: string;
  version: string;
  display_name: string;
  runtime_kind: string;
  python_version: string;
  executor_backend: string;
  sdk_version: string;
  status: string;
  available: boolean;
  manifest: Record<string, unknown>;
}

export interface AlgorithmEnvironmentSummary {
  environment_id: string;
  status: string;
  environment_digest: string | null;
  python_version: string | null;
  platform_tag: string | null;
  size_bytes: number | null;
  provision_task_id: string | null;
  validation_report: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  prepared_at: string | null;
}

export interface AlgorithmOperatorDraft {
  id: number;
  operator_code: string;
  operator_version: string;
  entrypoint: string;
  revision: number;
  status: string;
  contract: Record<string, unknown>;
  validation_errors: Array<Record<string, string>>;
}

export interface ExternalAlgorithmPackage {
  id: number;
  algorithm_code: string;
  algorithm_name: string;
  version: string;
  task_type: string;
  runtime_type: string;
  status: string;
  execution_status: string;
  package_sha256: string | null;
  package_size_bytes: number | null;
  manifest: Record<string, unknown> | null;
  environment: AlgorithmEnvironmentSummary | null;
  operator_drafts: AlgorithmOperatorDraft[];
  smoke_tests: Array<{
    smoke_test_id: string;
    operator_draft_id: number;
    task_id: string;
    status: string;
    output_preview: Record<string, unknown> | null;
    error_code: string | null;
    error_message: string | null;
  }>;
  models: Array<{
    id: number;
    model_key: string;
    sha256: string;
    size_bytes: number;
    status: string;
    original_filename: string;
  }>;
}
