#!/usr/bin/env bash
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
cd "$(dirname "$0")/../contracts"
: "${PRIVATE_KEY:?Set PRIVATE_KEY to a funded Monad testnet key}"
forge script script/DeployProofBench.s.sol:DeployProofBench \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key "$PRIVATE_KEY" \
  --broadcast -vv
