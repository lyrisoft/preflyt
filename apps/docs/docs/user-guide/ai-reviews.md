---
id: ai-reviews
title: AI reviews
sidebar_label: AI reviews
description: Optionally add AI feedback to pull requests with models and skills you control.
---

# AI reviews

AI reviews are **optional and advisory**. An AI review can explain a failure or comment on changed code, but it **never decides** whether a pull request passes. Preflyt's checks and policy decide that.

You control three things: the **model** that is used, the **skills** (instructions) it follows, and whether your **code is sent** to it.

## Before you start

- A deployment administrator must enable **AI model configuration** and **Advisory AI reviews** in **Settings → Configuration → Intelligence**, and set the `AI_PROVIDER_ENCRYPTION_KEY` key when installing. See [Configuration](../self-hosting/configuration.md#the-three-encryption-keys). Until then the AI Intelligence page says **AI is disabled for this deployment**.
- Only an **Owner or Admin** can manage models and routing.

## 1. Add a model

Open **AI Intelligence → Models** and select **Add model**.

1. Choose a provider: **OpenAI**, **Anthropic**, **Google**, **DeepSeek**, or an **OpenAI-compatible endpoint** for a self-hosted model.
2. Enter the exact **model name** and your **API key**. Preflyt fills in the provider's endpoint and sign-in details.
3. Save.

Saving **tests and approves** the model for your organization. The test only checks the connection and does not send any of your code. If the test fails, the model is still saved and you can select **Test** to retry. Keys stay private and are never shown again. Leave the key blank when editing to keep the saved one.

No token prices or budgets are required.

## 2. Choose which model is used

Open **AI Intelligence → Model router**.

- **Configure default** picks one model to use everywhere.
- **Stage overrides (optional)** let a specific stage use a different primary model and an optional fallback. Leave stages on **Use default** unless you need this.
- The **Code review model** controls the model for reviewing changed code. Here you also decide whether to **send repository code to the selected AI model**. This is an explicit setting that you control. Preflyt never turns it on for you.

## 3. Pick the skills

A **skill** is a short set of review instructions in Markdown, such as "Explain failed checks and missing evidence". Preflyt ships a library of built-in skills. Open **Skills**:

1. Select **Create skill** and start from a built-in skill, or choose **Upload SKILL.md** to load a file. Files must be UTF-8 Markdown up to 32 KiB, with a `name` and `description` in the header.
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
