// Compatibility exports for the existing workflow-edit endpoint. Both modes use
// one product-owned skill; the service keeps their validators separate.
import {
  preflytCiSetupSkill,
  preflytCiSetupSkillRef,
} from "./preflyt-ci-setup-skill.js";
export const githubActionsWorkflowSkill = preflytCiSetupSkill;
export const githubActionsWorkflowSkillRef = preflytCiSetupSkillRef;
export function githubActionsWorkflowPrompt(input: {
  policy: {
    branch: string;
    checks: {
      id: string;
      title: string;
      required: boolean;
      format: "junit" | "sarif" | null;
    }[];
  };
  workflow: string;
  apiUrl: string;
  request: string;
}) {
  return {
    system: preflytCiSetupSkill.instructions,
    user: JSON.stringify({ mode: "edit", ...input }),
  };
}
