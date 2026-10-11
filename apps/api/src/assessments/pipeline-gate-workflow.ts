import { stringify } from "yaml";
import { policyAction } from "./pipeline-action.js";
import { BadRequestException } from "@nestjs/common";
export function publicationGateWorkflow(
  workflowName: string,
  apiUrl: string | null,
) {
  if (!workflowName || workflowName === "Preflyt publication gate" || !apiUrl)
    throw new BadRequestException(
      "Choose the checks workflow and configure the public Preflyt API URL",
    );
  return stringify(
    {
      name: "Preflyt publication gate",
      on: { workflow_run: { workflows: [workflowName], types: ["completed"] } },
      permissions: { contents: "read", "id-token": "write" },
      jobs: {
        publication: {
          name: "Preflyt publication verified",
          "runs-on": "ubuntu-latest",
          "timeout-minutes": 12,
          if: "${{ github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.head_repository.full_name == github.repository }}",
          steps: [
            {
              name: "Wait for verified Preflyt publication",
              uses: policyAction,
              with: {
                mode: "gate",
                "api-url": apiUrl,
                "source-run": "${{ github.event.workflow_run.id }}",
                "source-attempt": "${{ github.event.workflow_run.run_attempt }}",
              },
            },
          ],
        },
      },
    },
    { lineWidth: 0 },
  );
}
