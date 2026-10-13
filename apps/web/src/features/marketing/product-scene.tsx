import { demoHealthReport, demoHealthTimeline } from './demo-health'
import { demoChecks, demoMetrics } from './demo-workspace'
import {
  FocusedEvidencePreview,
  FocusedHealthPreview,
  FocusedProtectionPreview,
} from './focused-previews'
import { WorkspaceWindow } from './workspace-window'

type ProductSceneVariant =
  'health' | 'findings' | 'contributors' | 'evidence' | 'protection'

const sceneDescriptions: Record<ProductSceneVariant, string> = {
  health: `Northstar repository health: ${demoHealthReport.findings.length} reported findings, ${demoHealthReport.analyses.length} analyses and ${demoHealthTimeline.length} comparable reports, with findings declining from ${demoHealthTimeline[0].findings} to ${demoHealthTimeline[demoHealthTimeline.length - 1].findings}.`,
  evidence: `Northstar engineering overview: ${demoMetrics.repositories} repositories, ${demoMetrics.prsAssessed} assessed pull requests and ${demoMetrics.snapshots} saved assessments. Pull request 128 has ${demoChecks.length} check results: ${demoChecks.filter((check) => check.status === 'Passed').length} passed, ${demoChecks.filter((check) => check.status === 'Failed').length} failed and ${demoChecks.filter((check) => check.status === 'Not evaluated').length} not evaluated.`,
  protection:
    'Northstar Merge Protection for main: a draft requires pull requests and the Preflyt / Engineering Readiness check. Activation is pending review; saving the draft does not change GitHub.',
  findings:
    'Northstar Findings page: six reported issues across three repositories, two high-severity issues and one missing or unverified result, with severity and check charts.',
  contributors:
    'Northstar Contributors page: three observed contributors, 86 authored pull requests and 64 PRs with saved assessments. Participation and revision-evidence charts sit above a populated contributor directory.',
}

/** A composed product image made from isolated demo components, not live data. */
export function ProductScene({ variant }: { variant: ProductSceneVariant }) {
  return (
    <div
      className={`product-scene product-scene-${variant}`}
      data-variant={variant}
      id={
        variant === 'health'
          ? 'repository-preview'
          : variant === 'findings' || variant === 'contributors'
            ? `${variant}-preview`
            : undefined
      }
      role='img'
      aria-label={sceneDescriptions[variant]}
    >
      <div className='product-scene-main' inert aria-hidden='true'>
        <WorkspaceWindow
          controls={false}
          initialView={
            variant === 'health'
              ? 'repository'
              : variant === 'findings' || variant === 'contributors'
                ? variant
                : 'overview'
          }
        />
      </div>
      {variant !== 'findings' && variant !== 'contributors' && (
        <div className='product-scene-detail' inert aria-hidden='true'>
          {variant === 'health' ? (
            <FocusedHealthPreview />
          ) : variant === 'evidence' ? (
            <FocusedEvidencePreview />
          ) : (
            <FocusedProtectionPreview />
          )}
        </div>
      )}
    </div>
  )
}
