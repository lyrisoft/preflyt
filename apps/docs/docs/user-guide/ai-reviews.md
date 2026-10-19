---
id: ai-reviews
title: AI reviews
sidebar_label: AI reviews
description: Optionally add AI feedback to pull requests with models and skills you control.
---

# AI reviews

AI reviews are **optional and advisory**. An AI review can explain a failure or comment on changed code, but it **never decides** whether a pull request passes. Preflyt's checks and policy decide that.

You control three things: the **model** that is used, the **skills** (instructions) it follows, and whether your **code is sent** to it.

<figure className="pf-guide-screenshot">
  <a href="/img/guides/ai-reviews.jpg" target="_blank" rel="noreferrer">
    <img src="/img/guides/ai-reviews.jpg" alt="AI Intelligence before deployment-level AI settings are enabled. Enable AI before adding models or routing reviews." width="1728" height="906" loading="lazy" />
  </a>
  <figcaption>AI Intelligence before deployment-level AI settings are enabled. Enable AI before adding models or routing reviews. Select the image to view it full size.</figcaption>
</figure>

## Before you start

- A deployment administrator must enable **AI model configuration** and **Advisory AI reviews** in **Settings → Configuration → Intelligence**, and set the `AI_PROVIDER_ENCRYPTION_KEY` key when installing. See [Configuration](../self-hosting/configuration.md#the-three-encryption-keys). Until then the AI Intelligence page says **AI is disabled for this deployment**.
- Only an **Owner or Admin** can manage models and routing.

## 1. Add a model

Open **AI Intelligence → Models** and select **Add model**.

1. Choose a provider: **OpenAI**, **Anthropic**, **Google**, **DeepSeek**, or an **OpenAI-compatible endpoint** for a self-hosted model.
2. Enter the exact **model name** and your **API key**. Preflyt fills in the provider's endpoint and sign-in details.
3. Save.

Saving **tests and approves** the model for your organization. The test only checks the connection and does not send any of your code. If the test fails, the model is still saved and you can select **Test** to retry. Keys stay private and are never shown again. Leave the key blank when editing to keep the saved one.

Connecting a model does not require token prices or a budget.

## 2. Choose which model is used

Open **AI Intelligence → Model router**.

- **Configure default** picks one model to use everywhere.
- **Stage overrides (optional)** let a specific stage use a different primary model and an optional fallback. Leave stages on **Use default** unless you need this.
- The **Code review model** controls the model for reviewing changed code. Here you also decide whether to **send repository code to the selected AI model**. This is an explicit setting that you control. Preflyt never turns it on for you.

## Model usage

Select a model name in **AI Intelligence → Models** to open its details. Choose
the last 7, 30 or 90 days to see recorded input tokens, output tokens and requests,
with activity grouped by scan, review or workflow request. AI security review activity links to
the saved scan.

New requests record provider-reported usage and the model name used at the time.
Failed requests can still consume tokens. Missing counts stay unknown, and
changing a connection does not relabel earlier usage. Only usage for repositories
you can access is included.

Earlier security reviews have allowance counters instead of provider usage records.
Those estimates appear separately and are excluded from recorded totals. These
figures are not a provider billing statement. Connection tests do not run model
inference and are excluded.

## AI security review limits

Open **AI Intelligence → Security review limits** to set the input tokens, output tokens and
model requests allowed for each AI security review in your organization. Only an
Owner or Admin can change these settings.

The defaults are **4,000,000 input tokens**, **131,072 output tokens** and **80 model
requests** per review. Raise the limits when a repository needs a longer review;
higher limits can increase provider charges. Select **Save review limits** to apply
them to new reviews. Queued and running scans keep their original limits.

Input usage is conservatively estimated, and repeated source context counts again.
These totals are separate from the model's context window. If a scan reaches a
limit, Preflyt stops it, cleans up its sandbox and records which limit was reached.
An incomplete scan is not an all-clear result. Review the limits before starting
another scan. Runner and provider limits also apply.

## 3. Pick the skills

A **skill** is a short set of review instructions in Markdown, such as "Explain failed checks and missing evidence". Preflyt ships a library of built-in skills. Open **Skills**:

1. Select **Create skill** and start from a built-in skill, or choose **Upload SKILL.md** to load a file. Files must be UTF-8 Markdown up to 128 KiB, with a `name` and `description` in the header.
2. Optionally limit the skill to certain repositories. Leave it empty for all repositories you can access.
3. A new skill starts **disabled**. Review the instructions, source and licence, **approve** the exact version, then **enable** it.
4. Editing a skill creates a new version that needs approving again.

Skills are attached to a [standard](standards.md): edit the standard, select **Add AI Review** and pick an approved, enabled skill.

## 4. Turn on pull request comments

In **Settings → PR feedback**, turn on **Review changed code with AI and comment on PRs**. Preflyt then reviews the changed code in each pull request and comments. It also publishes **Preflyt / AI Review** as an advisory check. AI findings do not override policy results. The integrated final gate waits for configured AI feedback to publish, so a model or publication failure can still fail the workflow. Only actionable changed-code issues are published, with at most five inline comments and deduplication across commits.

See [Pull request checks](pull-request-checks.md).

## Good to know

- AI output is kept separate from observed evidence in reports.
- AI never overrides a failed or incomplete check.
- AI is optional. Everything else in Preflyt works without it.

## View saved PR reviews

Open an assessment's **AI reviews** tab. Reviews from another assessment appear here only when the PR number and complete head and base revisions match. They are labelled **Saved on another assessment of this PR revision**, with a link to the original assessment. They remain historical advisory results, not replacement evidence for the displayed assessment.

The tab starts with the review date, suggestion count and a compact list. Select **Details** to read the full recommendation, impact and cited code. Expand **Review details** for coverage, publication and model metadata. **New review** keeps review setup out of the result list.

Saved actionable issues also appear under **Findings**. Their details use the same code editor, inline problem and solution, reviewed timestamp and triage controls as other findings.

Each new issue includes a severity and potential impact: **low** for minor effects, **medium** for bounded functional or security impact, **high** for plausible major disruption, data loss or unauthorized access, and **critical** only for evidence-supported widespread compromise or catastrophic impact. Ratings remain advisory and must be supported by the supplied evidence. Reviews without actionable issues return no suggestions. Historical reviews without ratings display **-**; run a new review to obtain a current impact assessment.


Skill descriptions support up to **2,000 characters** and instructions up to **24,000 characters**. The 128 KiB upload limit counts UTF-8 bytes, including the YAML header. The editor shows instruction usage; validation errors identify each invalid field and report the submitted count when a length limit is exceeded. Uploaded instructions are preserved in full after trimming surrounding whitespace. Preflyt does not fetch referenced files or execute skill commands; each AI review still uses at most three approved skills.
