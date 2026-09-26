// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ProofBench} from "../src/ProofBench.sol";

contract DeployProofBench is Script {
    function run() external {
        uint256 minStake = 0.01 ether;
        address reporter = vm.addr(vm.envUint("PRIVATE_KEY"));

        vm.startBroadcast();
        ProofBench bench = new ProofBench(minStake, reporter);
        bench.fundBenchmark{value: 1 ether}(1);
        vm.stopBroadcast();

        console2.log("ProofBench:", address(bench));
        console2.log("Reporter:", reporter);
        console2.log("Benchmark seeded: 1 (ResearchAgent v1.3)");
    }
}
