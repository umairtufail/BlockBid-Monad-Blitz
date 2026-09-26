# Deploy to Monad Testnet

## Live deployment (Blitz)

- **Contract:** [`0xc8D488532E4cE1540F5Fc23E5e6bC52bb2EaA5CF`](https://testnet.monadvision.com/address/0xc8D488532E4cE1540F5Fc23E5e6bC52bb2EaA5CF)
- **Chain:** Monad Testnet (`10143`)
- **Round duration:** 30 blocks

`web/.env.local`:
```
NEXT_PUBLIC_CONTRACT_ADDRESS=0xc8D488532E4cE1540F5Fc23E5e6bC52bb2EaA5CF
```

## Redeploy

1. Fund a key via https://faucet.monad.xyz
2. `export PRIVATE_KEY=0x...`
3. `./scripts/deploy-testnet.sh`
