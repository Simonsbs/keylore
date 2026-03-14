#!/bin/sh
set -eu

npm run typecheck
npm test
npm run test:contracts
npm run test:conformance
npm run test:hardening
npm run build
npm run ops:container-smoke
npm run ops:helm-validate
