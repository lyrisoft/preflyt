import { stringify } from "yaml";
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
              name: "Checkout trusted gate code",
              uses: "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
              with: { ref: "${{ github.sha }}", "persist-credentials": false },
            },
            {
              name: "Wait for verified Preflyt publication",
              shell: "bash",
              env: {
                PREFLYT_API_URL: apiUrl,
                PREFLYT_SOURCE_RUN_ID: "${{ github.event.workflow_run.id }}",
                PREFLYT_SOURCE_RUN_ATTEMPT:
                  "${{ github.event.workflow_run.run_attempt }}",
              },
              run: "python3 .github/actions/preflyt-policy/transport.py gate",
            },
          ],
        },
      },
    },
    { lineWidth: 0 },
  );
}
