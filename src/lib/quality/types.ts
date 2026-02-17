export interface ReviewIssue {
  acIndex: number;
  issueType: "hallucination" | "weak_evidence" | "untestable" | "overloaded";
  description: string;
  suggestedFix: string;
  severity: "error" | "warning";
}

export interface StoryReview {
  storyIndex: number;
  evidenceAccurate: boolean;
  issues: ReviewIssue[];
}

export interface MissedRequirement {
  topic: string;
  sourceEvidence: string;
  suggestion: string;
}

export interface OffTopicStory {
  index: number;
  reason: string;
}

export interface QualityReport {
  confidenceScore: number;
  confidenceLevel: "high" | "moderate" | "low";
  selfReview: {
    overallAssessment: "strong" | "acceptable" | "weak";
    issueCount: number;
    issues: Array<ReviewIssue & { storyIndex: number }>;
    missedRequirements: MissedRequirement[];
  };
  evidenceCoverage: {
    percentage: number;
    status: "strong" | "moderate" | "weak";
    acsWithoutEvidence: number;
  };
  coherence: {
    isCoherent: boolean;
    offTopicStories: OffTopicStory[];
  };
  assumptions: {
    percentage: number;
    status: "low" | "moderate" | "high";
    count: number;
  };
  qaPassRate: {
    percentage: number;
    totalFlags: number;
    errorFlags: number;
    warningFlags: number;
  };
  duplicates: {
    pairs: Array<{ storyIndexA: number; storyIndexB: number; similarity: number }>;
  };
}
