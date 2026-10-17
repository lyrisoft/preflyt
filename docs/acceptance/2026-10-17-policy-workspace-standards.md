# Policies: workspace standards selection

The **New branch policy** dialog offers verified standards created in the current workspace, including workspace copies of built-in templates. Built-in templates and repository template recommendations are not offered or preselected. Create or copy a standard in Standards before creating a policy if the workspace catalogue is empty.

The repository standards response adds `workspaceCatalogue`, containing the latest verified workspace versions. The existing catalogue remains available for resolving saved policy versions and other existing consumers. Editing a policy retains its exact saved standards, including legacy template references, without offering unrelated templates. Published policies and assessment history are unchanged.

Local verification: 10 policy browser tests and 13 organization-standards API integration tests passed. Coverage includes empty workspace, template exclusion, policy creation, legacy draft editing, latest workspace versions and tenant isolation. Web/API type checks, focused web lint and diff whitespace checks passed. API tests used a disposable local database; no live policies were changed. No commit or push was performed.
