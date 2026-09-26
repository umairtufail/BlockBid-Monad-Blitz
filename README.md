# BlockBid — Live Ad Slot Auction

Highest bidder each short round wins the **onchain billboard** and sets the ad (headline + link). Built for Monad Blitz Berlin.

## Live demo contract (Monad Testnet)

`0xc8D488532E4cE1540F5Fc23E5e6bC52bb2EaA5CF`  
Explorer: https://testnet.monadvision.com/address/0xc8D488532E4cE1540F5Fc23E5e6bC52bb2EaA5CF


## Stack
- `contracts/` — Foundry `AdSlotAuction.sol`
- `web/` — Next.js + Viem/Wagmi billboard UI
- Network: **Monad Testnet** (chain id `10143`)

## Quick start

### 1. Contracts
```bash
export PATH="$PATH:$HOME/.foundry/bin"
cd contracts
forge test -vv
```

### 2. Deploy to Monad Testnet
1. Get testnet MON from the [Monad faucet](https://faucet.monad.xyz)
2. Export a funded key (never commit it):
```bash
export PRIVATE_KEY=0x...
./scripts/deploy-testnet.sh
```
3. Copy the printed address into `web/.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

### 3. Web UI
```bash
cd web
npm install
npm run dev
```
Open http://localhost:3000 — connect MetaMask on Monad Testnet.

## Demo flow (3 minutes)
1. Wallet A bids  
2. Wallet B outbids (A refunded)  
3. Wait until blocks left = 0 → **Settle**  
4. Winner **Publish ad** → billboard updates  

## Pitch
Attention is scarce. We auction the next ad slot in real time on Monad — rebidding only feels alive when fees and finality don’t kill the fight.

## License
MIT
