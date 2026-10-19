#!/bin/sh
set -eu
mkdir -p /home/pentester/.cache /home/pentester/.pki/nssdb
certutil -N -d sql:/home/pentester/.pki/nssdb --empty-password
certutil -A -n 'Testing Root CA' -t 'C,,' -i /app/certs/ca.crt -d sql:/home/pentester/.pki/nssdb
caido-cli --listen 0.0.0.0:48080 --allow-guests --no-logging --no-open --import-ca-cert /app/certs/ca.p12 --import-ca-cert-pass '' >/tmp/caido.log 2>&1 &
exec "$@"
