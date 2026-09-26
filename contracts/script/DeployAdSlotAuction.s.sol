// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AdSlotAuction} from "../src/AdSlotAuction.sol";

contract DeployAdSlotAuction is Script {
    function run() external {
        uint256 duration = vm.envOr("ROUND_DURATION_BLOCKS", uint256(30));
        vm.startBroadcast();
        AdSlotAuction auction = new AdSlotAuction(duration);
        vm.stopBroadcast();
        console2.log("AdSlotAuction deployed at:", address(auction));
        console2.log("roundDurationBlocks:", duration);
    }
}
