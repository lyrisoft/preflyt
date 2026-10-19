# syntax=docker/dockerfile:1
FROM docker:29-cli@sha256:1a4c7cb63513f349bdad01fcc6e0f3f2f67d37b9da86f14dc0d4a0942eecda00 AS docker-cli
FROM golang:1.25-bookworm@sha256:3b4a11519ad929d1e1d261a12cff056f0c85b735253d7d861346b9c6f8b36437 AS go-toolchain
FROM python:3.12.15-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258 AS dependencies
RUN apt-get update && apt-get install -y --no-install-recommends git build-essential \
    && python -m venv /opt/venv
COPY --from=go-toolchain /usr/local/go /usr/local/go
ENV PATH=/usr/local/go/bin:$PATH
COPY tools/strix-runner/requirements.txt tools/strix-runner/constraints.txt /requirements/
RUN /opt/venv/bin/pip install --no-cache-dir -r /requirements/requirements.txt

FROM python:3.12.15-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates procps \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 preflyt && useradd --uid 1000 --gid 1000 --no-create-home preflyt
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dependencies /opt/venv /opt/venv
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md /usr/share/licenses/preflyt/
COPY tools/strix-runner /opt/preflyt/strix
ENV PATH=/opt/venv/bin:$PATH PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ARG PREFLYT_BUILD_VERSION=development
ARG PREFLYT_BUILD_SHA=unknown
ENV PREFLYT_BUILD_VERSION=$PREFLYT_BUILD_VERSION PREFLYT_BUILD_SHA=$PREFLYT_BUILD_SHA
WORKDIR /opt/preflyt/strix
USER 1000:1000
CMD ["python", "runner.py", "--state", "/var/lib/preflyt/strix"]
