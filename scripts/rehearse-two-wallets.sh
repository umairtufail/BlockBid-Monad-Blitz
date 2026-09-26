#!/usr/bin/env bash
# Two-wallet rehearsal against local anvil (no testnet funds needed).
set -euo pipefail
export PATH="$PATH:$HOME/.foundry/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/contracts"

RPC="${RPC_URL:-http://127.0.0.1:8545}"
# Anvil default keys
A_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
B_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
A_ADDR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
B_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

if ! curl -s -X POST "$RPC" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null; then
  echo "Start anvil first: anvil --port 8545"
  exit 1
fi

echo "== Deploy =="
ADDR=$(forge create src/AdSlotAuction.sol:AdSlotAuction \
  --rpc-url "$RPC" \
  --private-key "$A_KEY" \
  --broadcast \
  --constructor-args 5 2>/dev/null | awk '/Deployed to:/ {print $3}')
echo "Contract: $ADDR"

echo "== A bids 1 ETH =="
cast send "$ADDR" "bid()" --value 1ether --rpc-url "$RPC" --private-key "$A_KEY" >/dev/null
cast call "$ADDR" "highestBidder()(address)" --rpc-url "$RPC"

echo "== B outbids 2 ETH =="
cast send "$ADDR" "bid()" --value 2ether --rpc-url "$RPC" --private-key "$B_KEY" >/dev/null
cast call "$ADDR" "highestBidder()(address)" --rpc-url "$RPC"

END=$(cast call "$ADDR" "endBlock()(uint256)" --rpc-url "$RPC")
echo "endBlock=$END — mining past end..."
# mine blocks via anvil_mine
cast rpc anvil_mine 6 --rpc-url "$RPC" >/dev/null

echo "== Settle =="
cast send "$ADDR" "settle()" --rpc-url "$RPC" --private-key "$A_KEY" >/dev/null
cast call "$ADDR" "pendingWinner()(address)" --rpc-url "$RPC"

echo "== B sets ad =="
cast send "$ADDR" "setAd(string,string)" "50% OFF — MONAD BLITZ" "https://monad.xyz" \
  --rpc-url "$RPC" --private-key "$B_KEY" >/dev/null
cast call "$ADDR" "headline()(string)" --rpc-url "$RPC"
cast call "$ADDR" "link()(string)" --rpc-url "$RPC"

echo "OK — two-wallet bid war + ad publish succeeded"
echo "A=$A_ADDR B=$B_ADDR contract=$ADDR"
