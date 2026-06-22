export type RecordType =
  | "access_review"
  | "change_event"
  | "vendor_risk"
  | "policy_acknowledged"
  | "incident_report"
  | "ai_risk_assessment"
  | "training_data_governance"
  | "model_evaluation"
  | "human_oversight"
  | "model_drift_event"
  | "governance_review";

export interface EvidenceRequest {
  record_type: RecordType;
  payload: Record<string, unknown>;
  system_name: string;
  identity?: string;
  resource?: string;
  environment?: "production" | "staging" | "development";
  occurred_at?: string;
}

export interface EvidenceResponse {
  record_id: string;
  record_type: RecordType;
  mapped_controls: string[];
}

export interface AttestInput {
  record_type: RecordType;
  payload: Record<string, unknown>;
  system_name: string;
  identity?: string;
  resource?: string;
  environment?: "production" | "staging" | "development";
  occurred_at?: string;
  enforce_gates?: boolean;
}

export interface ClientConfig {
  apiKey: string;
  workspaceId: string;
  baseUrl: string;
}
