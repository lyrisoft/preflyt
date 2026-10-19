# Upstream tooling is isolated by sandbox.py, with no sudo/host access or outbound network.
ARG STRIX_SANDBOX_BASE=ghcr.io/usestrix/strix-sandbox@sha256:478e0b37ec83b2ba8c6e159593cb46d5dc9b624a45d6a9bb606851b83058d284
FROM ${STRIX_SANDBOX_BASE}
USER root
RUN rm -f /etc/sudoers.d/* && printf 'root ALL=(ALL:ALL) ALL\n' > /etc/sudoers
COPY sandbox-entrypoint.sh /opt/preflyt/entrypoint.sh
RUN chmod 0555 /opt/preflyt/entrypoint.sh
USER 1000:1000
ENTRYPOINT ["/opt/preflyt/entrypoint.sh"]
