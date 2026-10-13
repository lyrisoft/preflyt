import type { Pack, Selection, Standards } from './repository-queries'

export type StandardRef = { id: string; version: string }

export function standardGroups(catalogue: Pack[]) {
  const groups = new Map<string, Pack[]>()
  for (const pack of catalogue)
    groups.set(pack.id, [...(groups.get(pack.id) ?? []), pack])
  return [...groups.values()].map((versions) =>
    versions.sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true })
    )
  )
}

export function selectionChanges(
  data: Standards,
  selected: StandardRef[],
  profile: string
) {
  const packs = selected.flatMap((ref) => {
    const pack = data.catalogue.find(
      (p) => p.id === ref.id && p.version === ref.version
    )
    return pack ? [pack] : []
  })
  const rules = [
    ...new Map(packs.flatMap((p) => p.rules).map((r) => [r.id, r])).values(),
  ]
  const required = rules.filter((r) => r.requiredIn.includes(profile))
  const previousRequired = data.selection
    ? data.controls.filter((r) => r.required).map((r) => r.id)
    : []
  return {
    packs,
    rules,
    required,
    added: required.filter((r) => !previousRequired.includes(r.id)),
    removed: data.selection
      ? data.controls.filter(
          (r) => r.required && !required.some((next) => next.id === r.id)
        )
      : [],
    changedVersions: selected.filter((ref) =>
      data.selection?.packs.some(
        (old) => old.id === ref.id && old.version !== ref.version
      )
    ),
    removedStandards:
      data.selection?.packs.filter(
        (old) => !selected.some((ref) => ref.id === old.id)
      ) ?? [],
  }
}

export function selectionBody(
  data: Standards,
  selected: StandardRef[],
  profile: string
) {
  return {
    profile,
    packs: selected.map(({ id, version }) => ({ id, version })),
    expectedSelectionId: data.selection?.id ?? null,
  } satisfies {
    profile: string
    packs: StandardRef[]
    expectedSelectionId: Selection['id'] | null
  }
}
