#!/bin/sh
# Builds the configured test copy of the site used by test2.js.
cd "$(dirname "$0")/.." || exit 1
sed -e 's|endpoint: ""|endpoint: "http://127.0.0.1:8898/exec"|' \
    -e 's|secret: ""|secret: "test-secret-123"|' \
    index.html > index.test.html
echo "wrote index.test.html"
